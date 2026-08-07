/**
 * @file Tree-sitter grammar for Surge configuration documents
 * @author Civi
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "sgconf",

  rules: {
    source_file: _ => blank(),
  },
});
