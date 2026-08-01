"""ECLAT correctness, including the cross-validation gate for Phase 10.

The central test here is ``TestCrossValidationAgainstFpGrowth``: our own ECLAT
and `mlxtend`'s FP-Growth must return **exactly** the same frequent itemsets for
the same transactions and the same minimum support. They share no code and take
completely different routes — vertical tidset intersection versus a prefix-tree
projection — so agreement across hundreds of randomised datasets is a strong
correctness argument for an algorithm with no maintained reference library.
"""

from __future__ import annotations

import random
from collections.abc import Sequence

import pandas as pd
import pytest
from mlxtend.frequent_patterns import fpgrowth

from app.algorithms.eclat import (
    association_confidence,
    eclat,
    itemsets_by_length,
)

Transactions = Sequence[Sequence[str]]


def as_sets(itemsets: Sequence[object]) -> set[frozenset[str]]:
    """Frequent itemsets as a comparable set, ignoring order."""
    return {frozenset(found.items) for found in itemsets}  # type: ignore[attr-defined]


def fpgrowth_itemsets(transactions: Transactions, min_support: float) -> set[frozenset[str]]:
    """The same question, asked of mlxtend's FP-Growth.

    mlxtend wants a one-hot DataFrame rather than a list of transactions, so the
    encoding happens here. Columns are sorted purely so the frame is stable to
    look at when a test fails.
    """
    items = sorted({item for transaction in transactions for item in transaction})
    frame = pd.DataFrame(
        [[item in set(transaction) for item in items] for transaction in transactions],
        columns=items,
    )
    if frame.empty or not items:
        return set()

    found = fpgrowth(frame, min_support=min_support, use_colnames=True)
    return {frozenset(row) for row in found["itemsets"]}


# -----------------------------------------------------------------------------


class TestBasicBehaviour:
    def test_finds_a_single_frequent_item(self) -> None:
        result = eclat([["a"], ["a"], ["b"]], min_support=0.5)

        assert as_sets(result) == {frozenset({"a"})}

    def test_finds_a_frequent_pair(self) -> None:
        result = eclat([["a", "b"], ["a", "b"], ["a"], ["c"]], min_support=0.5)

        assert as_sets(result) == {frozenset({"a"}), frozenset({"b"}), frozenset({"a", "b"})}

    def test_reports_support_count_and_fraction(self) -> None:
        result = eclat([["a"], ["a"], ["a"], ["b"]], min_support=0.5)

        found = next(entry for entry in result if entry.items == ("a",))
        assert found.support_count == 3
        assert found.support == pytest.approx(0.75)

    def test_treats_a_transaction_as_a_set(self) -> None:
        # A repeated item within one transaction must not count twice.
        result = eclat([["a", "a", "a"], ["b"]], min_support=0.5)

        found = next(entry for entry in result if entry.items == ("a",))
        assert found.support_count == 1

    def test_generates_each_itemset_once_regardless_of_item_order(self) -> None:
        # Without suffix-only extension this yields both {a,b} and {b,a}.
        result = eclat([["b", "a"], ["a", "b"]], min_support=0.5)

        pairs = itemsets_by_length(result, 2)
        assert len(pairs) == 1
        assert set(pairs[0].items) == {"a", "b"}

    def test_returns_nothing_for_no_transactions(self) -> None:
        assert eclat([], min_support=0.5) == []

    def test_returns_nothing_when_nothing_meets_support(self) -> None:
        assert eclat([["a"], ["b"], ["c"]], min_support=0.9) == []

    def test_full_support_requires_every_transaction(self) -> None:
        assert as_sets(eclat([["a"], ["a"]], min_support=1.0)) == {frozenset({"a"})}
        assert eclat([["a"], ["b"]], min_support=1.0) == []


class TestSupportThreshold:
    def test_threshold_is_a_genuine_lower_bound(self) -> None:
        """0.25 of 10 transactions is 2.5, so 2 occurrences must not qualify.

        Flooring instead of ceiling here would admit itemsets below the
        threshold the caller asked for — quietly lowering the bar.
        """
        transactions = [["a", "b"], ["a", "b"], *([["c"]] * 8)]

        result = as_sets(eclat(transactions, min_support=0.25))

        assert frozenset({"a"}) not in result
        assert frozenset({"c"}) in result

    def test_an_itemset_exactly_at_the_threshold_qualifies(self) -> None:
        transactions = [["a"], ["a"], ["a"], ["b"]]

        assert frozenset({"a"}) in as_sets(eclat(transactions, min_support=0.75))

    def test_floating_point_representation_does_not_shift_the_threshold(self) -> None:
        # 0.3 * 10 is 2.9999999999999996 in binary floating point.
        transactions = [*([["a"]] * 3), *([["b"]] * 7)]

        assert frozenset({"a"}) in as_sets(eclat(transactions, min_support=0.3))

    @pytest.mark.parametrize("min_support", [0.0, -0.1, 1.1, 2.0])
    def test_rejects_an_out_of_range_threshold(self, min_support: float) -> None:
        with pytest.raises(ValueError, match="min_support"):
            eclat([["a"]], min_support=min_support)


class TestMaxLength:
    def test_caps_itemset_size(self) -> None:
        result = eclat([["a", "b", "c"], ["a", "b", "c"]], min_support=0.5, max_length=2)

        assert max(len(entry.items) for entry in result) == 2

    def test_still_returns_siblings_at_the_capped_depth(self) -> None:
        result = eclat([["a", "b", "c"], ["a", "b", "c"]], min_support=0.5, max_length=2)

        assert len(itemsets_by_length(result, 2)) == 3

    def test_uncapped_finds_the_full_itemset(self) -> None:
        result = eclat([["a", "b", "c"], ["a", "b", "c"]], min_support=0.5)

        assert frozenset({"a", "b", "c"}) in as_sets(result)

    def test_rejects_a_nonsensical_cap(self) -> None:
        with pytest.raises(ValueError, match="max_length"):
            eclat([["a"]], min_support=0.5, max_length=0)


class TestDeterminism:
    """Reproducibility is an acceptance criterion, not a nicety.

    A moderator reviewing a candidate must see the same thing the run produced.
    """

    def test_repeated_runs_are_identical(self) -> None:
        transactions = [["a", "b"], ["b", "c"], ["a", "b", "c"], ["c"]]

        first = eclat(transactions, min_support=0.4)
        second = eclat(transactions, min_support=0.4)

        assert [(e.items, e.support_count) for e in first] == [
            (e.items, e.support_count) for e in second
        ]

    def test_ordering_does_not_depend_on_item_insertion_order(self) -> None:
        forwards = eclat([["a", "b", "c"], ["c", "b", "a"]], min_support=0.5)
        backwards = eclat([["c", "b", "a"], ["a", "b", "c"]], min_support=0.5)

        assert [e.items for e in forwards] == [e.items for e in backwards]

    def test_sorted_by_descending_support_then_length_then_alphabetically(self) -> None:
        result = eclat([["a", "b"], ["a", "b"], ["a"], ["z"]], min_support=0.25)

        keys = [(-e.support_count, len(e.items), e.items) for e in result]
        assert keys == sorted(keys)


class TestCrossValidationAgainstFpGrowth:
    """The Phase 10 gate.

    Our ECLAT and mlxtend's FP-Growth must agree exactly. They share no code.
    """

    @pytest.mark.parametrize(
        "transactions",
        [
            pytest.param([["a", "b"], ["a", "b"], ["a"], ["c"]], id="simple"),
            pytest.param([["a"], ["b"], ["c"], ["d"]], id="all-disjoint"),
            pytest.param([["a", "b", "c"]] * 5, id="identical-transactions"),
            pytest.param([["a", "b", "c", "d", "e"], ["a", "b"], ["a", "b", "c"]], id="nested"),
            pytest.param([["x"]], id="single-transaction"),
        ],
    )
    @pytest.mark.parametrize("min_support", [0.2, 0.4, 0.5, 0.75, 1.0])
    def test_agrees_on_worked_examples(
        self, transactions: Transactions, min_support: float
    ) -> None:
        assert as_sets(eclat(transactions, min_support=min_support)) == fpgrowth_itemsets(
            transactions, min_support
        )

    @pytest.mark.parametrize("seed", range(40))
    def test_agrees_on_random_datasets(self, seed: int) -> None:
        """Randomised, but seeded — a failure is reproducible from its seed."""
        rng = random.Random(seed)
        alphabet = "abcdefgh"

        transactions = [rng.sample(alphabet, rng.randint(1, 5)) for _ in range(rng.randint(3, 25))]
        min_support = rng.choice([0.1, 0.2, 0.3, 0.5])

        ours = as_sets(eclat(transactions, min_support=min_support))
        theirs = fpgrowth_itemsets(transactions, min_support)

        assert ours == theirs, (
            f"seed={seed} min_support={min_support}\n"
            f"only ours: {ours - theirs}\nonly theirs: {theirs - ours}"
        )

    @pytest.mark.parametrize("seed", range(10))
    def test_agrees_on_dense_datasets(self, seed: int) -> None:
        """Dense data is where an itemset explosion and a pruning bug would show."""
        rng = random.Random(1000 + seed)
        alphabet = "abcdef"

        transactions = [
            [item for item in alphabet if rng.random() < 0.7] or ["a"] for _ in range(20)
        ]

        ours = as_sets(eclat(transactions, min_support=0.3))
        theirs = fpgrowth_itemsets(transactions, 0.3)

        assert ours == theirs, f"seed={seed}"

    @pytest.mark.parametrize("seed", range(10))
    def test_support_counts_also_agree(self, seed: int) -> None:
        """Matching itemsets is not enough; the counts must match too."""
        rng = random.Random(2000 + seed)
        transactions = [rng.sample("abcde", rng.randint(1, 4)) for _ in range(15)]

        ours = {frozenset(e.items): e.support_count for e in eclat(transactions, min_support=0.2)}

        items = sorted({item for transaction in transactions for item in transaction})
        frame = pd.DataFrame(
            [[item in set(transaction) for item in items] for transaction in transactions],
            columns=items,
        )
        theirs_frame = fpgrowth(frame, min_support=0.2, use_colnames=True)
        theirs = {
            frozenset(row.itemsets): round(row.support * len(transactions))
            for row in theirs_frame.itertuples()
        }

        assert ours == theirs, f"seed={seed}"


class TestAssociationConfidence:
    def test_computes_confidence_of_a_rule(self) -> None:
        # a appears 4 times, {a,b} 3 times -> 0.75
        transactions = [["a", "b"], ["a", "b"], ["a", "b"], ["a"], ["c"]]
        itemsets = eclat(transactions, min_support=0.2)

        assert association_confidence(itemsets, ("a",), ("b",)) == pytest.approx(0.75)

    def test_is_one_when_the_consequent_always_follows(self) -> None:
        itemsets = eclat([["a", "b"], ["a", "b"]], min_support=0.5)

        assert association_confidence(itemsets, ("a",), ("b",)) == pytest.approx(1.0)

    def test_returns_unknown_rather_than_zero_for_an_infrequent_antecedent(self) -> None:
        # "Never measured" and "measured to be useless" are different answers.
        itemsets = eclat([["a"], ["b"], ["c"], ["d"]], min_support=0.9)

        assert association_confidence(itemsets, ("a",), ("b",)) is None

    def test_returns_unknown_when_the_combination_is_infrequent(self) -> None:
        itemsets = eclat([["a"], ["a"], ["b"]], min_support=0.5)

        assert association_confidence(itemsets, ("a",), ("b",)) is None
