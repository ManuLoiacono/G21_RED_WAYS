"""Reproducible compact context without changing the original display crop."""

import tempfile
from pathlib import Path
import unittest
from scripts.prepare_material import prepare, SOURCE


class MaterialPreparationTests(unittest.TestCase):
    def test_deterministic_source_preservation(self):
        original = SOURCE.read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            first = prepare(output=Path(directory) / "first.json")
            second = prepare(output=Path(directory) / "second.json")
            self.assertEqual(first, second)
            self.assertEqual(SOURCE.read_bytes(), original)
            self.assertLess((Path(directory) / "first.json").stat().st_size, 20000)


if __name__ == "__main__":
    unittest.main()
