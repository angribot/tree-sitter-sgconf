# Use a section-dispatched syntax-only CST

Although Surge configuration documents are INI-like, each section has its own statement shapes. The parser therefore exposes stable section-specific nodes backed by reusable syntax-level line nodes, preserves raw and unknown input, and leaves validation and reference resolution to downstream tooling. This costs more grammar than a generic INI tree but prevents every consumer from reparsing section bodies; unlike a per-key semantic tree, it also avoids parser churn as Surge options and platform constraints change.
