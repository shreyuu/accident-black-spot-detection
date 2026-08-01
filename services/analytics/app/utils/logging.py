"""Logging setup.

Deliberately minimal and deliberately structured-ish: this service processes
reports about real incidents, and a log line is the easiest place to leak
something it should not. The rule mirrors the mobile app's logger — log ids and
counts, never free text from a report and never a reporter's identity.
"""

from __future__ import annotations

import logging
import sys


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logging once, at startup."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-8s %(name)s %(message)s"))

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
