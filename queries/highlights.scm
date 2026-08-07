; Comments

(comment) @comment

; Sections

(section_header) @type

; Directives whose markers are hidden tokens occupy the whole directive node.
; More specific child captures below retain structure where the CST exposes it.

[
  (directive)
  (include_directive)
  (managed_config_directive)
  (forbidden_auto_upgrade_directive)
  (requirement_prefix)
  (requirement_suffix)
  (platform_requirement_prefix)
  (platform_requirement_suffix)
] @keyword

[
  "#!name="
  "#!desc="
  "#!system="
  "#!arguments="
  "#!requirement="
] @keyword

; Keys and names

[
  (key)
  (parameter_key)
] @property

[
  (declaration_name)
  (policy)
] @variable

[
  (module_argument_name)
  (module_argument_placeholder)
] @variable.parameter

; Rule and Requirement vocabulary

(rule_kind) @keyword

[
  (logical_operator)
  (requirement_operator)
  (merge_operator)
] @operator

(requirement_variable) @constant.builtin
(requirement_number) @number

; Values with an unambiguous string role

[
  (double_quoted_value)
  (single_quoted_value)
  (requirement_bare_value)
  (module_argument_default)
  (include_target)
  (managed_config_url)
  (forbidden_upgrade_target)
] @string

; Visible delimiters. Assignment commas and equals separators are hidden CST
; tokens, so they cannot be captured without changing the public syntax tree.

[
  "("
  ")"
  "["
  "]"
] @punctuation.bracket

[
  "="
  "&"
] @punctuation.delimiter

"%" @punctuation.special
