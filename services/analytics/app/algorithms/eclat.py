"""ECLAT — frequent itemset mining by vertical tidset intersection.

Written from the algorithm rather than taken from a library, because **there is
no maintained ECLAT for Python**. The Phase 0 audit established this: `mlxtend`
ships `apriori`, `fpgrowth`, `fpmax` and `hmine` but no ECLAT, and `pyECLAT` on
PyPI was last released in June 2020 against `pandas>=0.25`, which does not
survive contact with pandas 3.

Correctness is therefore established by **cross-validation against
`mlxtend.fpgrowth`** in the tests. Apriori, FP-Growth and ECLAT are different
routes to the same destination: for a given transaction set and minimum support
they must return byte-for-byte the same frequent itemsets. Two independent
implementations agreeing is a far stronger correctness argument than either
passing hand-written expectations, and it is cheap.

## The algorithm

Apriori and FP-Growth think *horizontally*: a transaction is a row, and support
is counted by scanning rows. ECLAT flips the layout. Each item is stored as its
**tidset** — the set of transaction ids containing it:

    transactions                     vertical layout
    T1: {a, b, c}                    a -> {T1, T2}
    T2: {a, b}                       b -> {T1, T2, T3}
    T3: {b, c}                       c -> {T1, T3}

The support of an itemset is then just the size of the intersection of its
items' tidsets, and candidate generation is a depth-first walk in which each
step intersects one more tidset:

    support({a, b}) = |{T1,T2} ∩ {T1,T2,T3}| = 2

Two properties make this efficient and are what the implementation relies on:

* **Intersections only shrink.** ``|A ∩ B| <= min(|A|, |B|)``, so once a prefix
  falls below the support threshold, every extension of it does too and the
  whole branch is abandoned. This is the Apriori downward-closure property,
  applied to a DFS rather than a level-wise scan.
* **Suffix-only extension.** Each recursion extends the prefix using only items
  that appear *after* the current one in a fixed order. That is what stops
  ``{a,b}`` and ``{b,a}`` from both being generated — without it the search
  enumerates every permutation and the cost explodes.

## Why it suits this project

Transactions here are small (a handful of features per cluster) and there are
few of them (one per cluster). At that size the algorithm choice barely matters
for speed — what matters is that the implementation is readable, deterministic,
and explainable to a moderator who is being asked to trust its output.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from app.models.domain import FrequentItemset

#: An item is any hashable label; the pipeline uses strings like "type=accident".
Item = str
Transaction = frozenset[Item]


def _build_vertical_layout(transactions: Sequence[Iterable[Item]]) -> dict[Item, set[int]]:
    """Invert transactions into ``item -> set of transaction indices``.

    Indices are used as transaction ids. They are positional and stable for a
    given input, which keeps the whole algorithm deterministic — a requirement
    for this phase, since a candidate a moderator reviewed must be reproducible.
    """
    tidsets: dict[Item, set[int]] = {}
    for tid, transaction in enumerate(transactions):
        # A transaction is a *set* of items: a repeated item within one
        # transaction must not count twice, and iterating the raw sequence
        # would let it.
        for item in set(transaction):
            tidsets.setdefault(item, set()).add(tid)
    return tidsets


def _eclat_recurse(
    prefix: tuple[Item, ...],
    candidates: list[tuple[Item, set[int]]],
    min_support_count: int,
    max_length: int | None,
    results: list[tuple[tuple[Item, ...], int]],
) -> None:
    """Depth-first search over itemset extensions.

    ``candidates`` holds ``(item, tidset)`` pairs that may extend ``prefix``,
    already filtered to those meeting minimum support and **sorted**, so the
    suffix-only rule below enumerates each itemset exactly once.
    """
    for index, (item, tidset) in enumerate(candidates):
        itemset = (*prefix, item)
        results.append((itemset, len(tidset)))

        if max_length is not None and len(itemset) >= max_length:
            # The branch is pruned, not abandoned mid-list: siblings at this
            # depth are still valid itemsets of the permitted length.
            continue

        # Only items *after* this one, which is what makes {a,b} and {b,a} one
        # itemset rather than two.
        extensions: list[tuple[Item, set[int]]] = []
        for other_item, other_tidset in candidates[index + 1 :]:
            intersection = tidset & other_tidset
            # Downward closure: an intersection can only shrink, so anything
            # failing support here fails for every extension of it too.
            if len(intersection) >= min_support_count:
                extensions.append((other_item, intersection))

        if extensions:
            _eclat_recurse(itemset, extensions, min_support_count, max_length, results)


def eclat(
    transactions: Sequence[Iterable[Item]],
    *,
    min_support: float = 0.3,
    max_length: int | None = None,
) -> list[FrequentItemset]:
    """Find every frequent itemset.

    Args:
        transactions: one iterable of item labels per transaction.
        min_support: fraction of transactions an itemset must appear in, in
            (0, 1]. Fractional rather than absolute so a threshold stays
            meaningful as the dataset grows.
        max_length: optional cap on itemset size. Useful because the number of
            itemsets is exponential in the worst case and long ones are rarely
            actionable.

    Returns:
        Frequent itemsets sorted by descending support, then by length, then
        alphabetically. **The ordering is part of the contract**: identical
        input must produce an identical list, because these end up in a
        moderation queue where a reviewer needs to see the same thing twice.

    Raises:
        ValueError: if ``min_support`` is outside (0, 1] or ``max_length`` < 1.
    """
    if not 0.0 < min_support <= 1.0:
        raise ValueError(f"min_support must be in (0, 1], got {min_support}")
    if max_length is not None and max_length < 1:
        raise ValueError(f"max_length must be at least 1, got {max_length}")

    transaction_count = len(transactions)
    if transaction_count == 0:
        return []

    # Ceiling, so min_support is a genuine lower bound. With 10 transactions and
    # min_support 0.25, an itemset in 2 of them is 0.2 and must NOT qualify;
    # rounding down would wrongly admit it.
    min_support_count = max(1, _ceil_int(min_support * transaction_count))

    tidsets = _build_vertical_layout(transactions)

    # Sorted by item label rather than by frequency. Frequency-descending is the
    # usual optimisation, but ties would then be broken by dictionary order and
    # the output would depend on insertion order. Determinism is worth more here
    # than a constant factor on datasets this size.
    frequent_singletons = sorted(
        ((item, tids) for item, tids in tidsets.items() if len(tids) >= min_support_count),
        key=lambda entry: entry[0],
    )

    results: list[tuple[tuple[Item, ...], int]] = []
    _eclat_recurse((), frequent_singletons, min_support_count, max_length, results)

    return sorted(
        (
            FrequentItemset(
                items=itemset,
                support_count=support_count,
                support=support_count / transaction_count,
            )
            for itemset, support_count in results
        ),
        key=lambda found: (-found.support_count, len(found.items), found.items),
    )


def _ceil_int(value: float) -> int:
    """Ceiling that is not fooled by floating-point representation.

    ``0.3 * 10`` is ``2.9999999999999996``, and a plain ``math.ceil`` turns that
    into 3 — correct here by luck. The reverse case is the dangerous one:
    ``0.7 * 10`` is ``6.999999999999999`` and ceils to 7, while ``0.1 * 3`` is
    ``0.30000000000000004`` and ceils to 1 rather than 0. Rounding to nine
    decimal places first removes the representation error without affecting any
    threshold anyone would actually choose.
    """
    import math

    return math.ceil(round(value, 9))


def itemsets_by_length(itemsets: Sequence[FrequentItemset], length: int) -> list[FrequentItemset]:
    """Filter to itemsets of exactly ``length`` items."""
    return [itemset for itemset in itemsets if len(itemset.items) == length]


def association_confidence(
    itemsets: Sequence[FrequentItemset],
    antecedent: tuple[Item, ...],
    consequent: tuple[Item, ...],
) -> float | None:
    """Confidence of ``antecedent -> consequent``.

    ``support(antecedent ∪ consequent) / support(antecedent)``: of the
    transactions containing the antecedent, the fraction that also contain the
    consequent.

    Returns ``None`` when either side is not frequent — that is genuinely
    "unknown", not zero, and collapsing the two would let a rule that was never
    measured read as one measured to be useless.
    """
    lookup = {frozenset(found.items): found.support_count for found in itemsets}

    antecedent_support = lookup.get(frozenset(antecedent))
    if antecedent_support is None or antecedent_support == 0:
        return None

    combined = lookup.get(frozenset(antecedent) | frozenset(consequent))
    if combined is None:
        return None

    return combined / antecedent_support
