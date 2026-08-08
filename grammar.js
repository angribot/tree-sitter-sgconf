/**
 * @file Tree-sitter grammar for Surge configuration documents
 * @author Civi
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const inlineComment = ($) => optional(field("comment", alias($._inline_comment, $.comment)));

const statementWithComment = ($, statement) => seq(statement, inlineComment($));

const statementRule = (statement) => ($) => statementWithComment($, statement($));

const conditionalStatement = ($, statement, namedStatement) =>
  choice(
    seq(
      field("condition", choice($.requirement_prefix, $.platform_requirement_prefix)),
      field("body", alias(statement, namedStatement)),
      inlineComment($),
    ),
    seq(
      field("body", alias(statement, namedStatement)),
      field("condition", choice($.requirement_suffix, $.platform_requirement_suffix)),
    ),
  );

const conditionalStatementRule = (statement, namedStatement) => ($) =>
  conditionalStatement($, statement($), namedStatement($));

const whitespaceValueField = ($, name) =>
  field(name, alias($._whitespace_positional_value, $.positional_value));

const whitespaceParameterField = ($) =>
  field("parameter", alias($._whitespace_named_parameter, $.named_parameter));

const valueWithBareForm = ($, bareValue) =>
  choice($.double_quoted_value, $.single_quoted_value, alias(bareValue, $.bare_value));

const withModulePlaceholders = ($, valueChunk) =>
  choice(valueChunk, $._literal_percent, $.module_argument_placeholder);

const directiveBodyItem = ($) => choice($.comment, $._directive);

const unknownSectionBodyItem = ($) => choice(directiveBodyItem($), $.unknown_line);

const assignmentSectionBodyItem = ($) =>
  choice(
    directiveBodyItem($),
    alias($._conditional_assignment, $.conditional_statement),
    $.assignment,
    alias($._non_assignment_line, $.unknown_line),
  );

const namedDeclarationSectionBodyItem = ($) =>
  choice(
    directiveBodyItem($),
    alias($._conditional_named_declaration, $.conditional_statement),
    prec.dynamic(1, $.named_declaration),
    alias(prec.dynamic(-1, $._unknown_declaration_line), $.unknown_line),
    alias($._non_assignment_line, $.unknown_line),
  );

const ruleSectionBodyItem = ($) =>
  choice(
    directiveBodyItem($),
    alias($._conditional_logical_rule, $.conditional_statement),
    alias($._conditional_rule, $.conditional_statement),
    prec.dynamic(2, $.logical_rule),
    prec.dynamic(1, $.rule),
    prec.dynamic(3, $.malformed_logical_rule),
    alias(prec.dynamic(-2, $._unknown_comma_line), $.unknown_line),
  );

const rulesetSectionBodyItem = ($) =>
  choice(
    directiveBodyItem($),
    alias($._conditional_ruleset_logical_rule, $.conditional_statement),
    alias($._conditional_ordered_comma_statement, $.conditional_statement),
    prec.dynamic(2, $.ruleset_logical_rule),
    prec.dynamic(1, $.ordered_comma_statement),
    prec.dynamic(3, alias($._ruleset_malformed_logical_rule, $.malformed_logical_rule)),
    alias(prec.dynamic(-2, $._unknown_comma_line), $.unknown_line),
  );

const structuredSectionBodyItem = (completeRule, conditionalRule, namedStatement) => ($) =>
  choice(
    directiveBodyItem($),
    alias(conditionalRule($), $.conditional_statement),
    alias(prec.dynamic(1, completeRule($)), namedStatement($)),
    alias(prec.dynamic(-1, $._whitespace_unknown_line), $.unknown_line),
  );

const section =
  (header, bodyItem = unknownSectionBodyItem) =>
  ($) =>
    seq(header($), repeat(seq(repeat1($._newline), bodyItem($))));

const fixedSection = (header, bodyItem) =>
  section(($) => alias(header, $.section_header), bodyItem);

const namedSection = (header, bodyItem) =>
  section(($) => alias(header($), $.section_header), bodyItem);

const dynamicHeader = (prefix) => ($) =>
  seq(prefix, $._header_separator, field("name", $.section_name), "]");

const sectionRules = ($) => [
  $.general_section,
  $.proxy_section,
  $.proxy_group_section,
  $.rule_section,
  $.host_section,
  $.url_rewrite_section,
  $.header_rewrite_section,
  $.body_rewrite_section,
  $.map_local_section,
  $.mitm_section,
  $.keystore_section,
  $.ssid_setting_section,
  $.script_section,
  $.panel_section,
  $.ponte_section,
  $.port_forwarding_section,
  $.testing_section,
  $.dhcp_section,
  $.snell_server_section,
  $.mtproto_section,
  $.wireguard_section,
  $.tailscale_section,
  $.ruleset_section,
  $.unknown_section,
];

export default grammar({
  name: "sgconf",

  extras: (_) => [/[ \t]/],

  externals: ($) => [
    $._logical_line_end,
    $._ruleset_logical_line_start,
    $._requirement_comparison_operator,
    $._requirement_or_operator,
    $._requirement_and_operator,
    $._requirement_unary_operator,
  ],

  conflicts: ($) => [
    ...sectionRules($).map((sectionRule) => [sectionRule]),
    [$.key],
    [$._comma_value, $.parameter_key],
    [$._whitespace_value, $._whitespace_unknown_value],
    [$.rule_kind, $._unknown_comma_line],
    [$.declaration_name, $._unknown_declaration_line],
    [$.logical_rule_expression, $._malformed_logical_rule],
  ],

  rules: {
    source_file: ($) =>
      seq(
        repeat(choice($._newline, seq(choice($.comment, $._directive), $._newline))),
        optional(choice($.comment, $._directive, $._section_list)),
      ),

    _section_list: ($) =>
      seq($._section, repeat(seq(repeat1($._newline), $._section)), optional(repeat1($._newline))),

    _section: ($) => choice(...sectionRules($)),

    general_section: fixedSection("[General]", assignmentSectionBodyItem),
    proxy_section: fixedSection("[Proxy]", namedDeclarationSectionBodyItem),
    proxy_group_section: fixedSection("[Proxy Group]", namedDeclarationSectionBodyItem),
    rule_section: fixedSection("[Rule]", ruleSectionBodyItem),
    host_section: fixedSection("[Host]", assignmentSectionBodyItem),
    url_rewrite_section: fixedSection(
      "[URL Rewrite]",
      structuredSectionBodyItem(
        ($) => $._url_rewrite_statement,
        ($) => $._conditional_url_rewrite,
        ($) => $.rewrite,
      ),
    ),
    header_rewrite_section: fixedSection(
      "[Header Rewrite]",
      structuredSectionBodyItem(
        ($) => $._header_rewrite_statement,
        ($) => $._conditional_header_rewrite,
        ($) => $.rewrite,
      ),
    ),
    body_rewrite_section: fixedSection(
      "[Body Rewrite]",
      structuredSectionBodyItem(
        ($) => $._body_rewrite_statement,
        ($) => $._conditional_body_rewrite,
        ($) => $.rewrite,
      ),
    ),
    map_local_section: fixedSection(
      "[Map Local]",
      structuredSectionBodyItem(
        ($) => $._map_local_statement,
        ($) => $._conditional_map_local,
        ($) => $.rewrite,
      ),
    ),
    mitm_section: fixedSection("[MITM]", assignmentSectionBodyItem),
    keystore_section: fixedSection("[Keystore]", namedDeclarationSectionBodyItem),
    ssid_setting_section: fixedSection(
      "[SSID Setting]",
      structuredSectionBodyItem(
        ($) => $._ssid_setting_statement,
        ($) => $._conditional_ssid_setting,
        ($) => $.whitespace_statement,
      ),
    ),
    script_section: fixedSection("[Script]", namedDeclarationSectionBodyItem),
    panel_section: fixedSection("[Panel]", namedDeclarationSectionBodyItem),
    ponte_section: fixedSection("[Ponte]", assignmentSectionBodyItem),
    port_forwarding_section: fixedSection(
      "[Port Forwarding]",
      structuredSectionBodyItem(
        ($) => $._port_forwarding_statement,
        ($) => $._conditional_port_forwarding,
        ($) => $.whitespace_statement,
      ),
    ),
    testing_section: fixedSection("[Testing]", assignmentSectionBodyItem),
    dhcp_section: fixedSection("[DHCP]", assignmentSectionBodyItem),
    snell_server_section: fixedSection("[Snell Server]", assignmentSectionBodyItem),
    mtproto_section: fixedSection("[MTProto]", assignmentSectionBodyItem),
    wireguard_section: namedSection(($) => $._wireguard_section_header, assignmentSectionBodyItem),
    tailscale_section: namedSection(($) => $._tailscale_section_header, assignmentSectionBodyItem),
    ruleset_section: namedSection(($) => $._ruleset_section_header, rulesetSectionBodyItem),
    unknown_section: namedSection(($) => $._unknown_section_header),

    _wireguard_section_header: dynamicHeader("[WireGuard"),
    _tailscale_section_header: dynamicHeader("[Tailscale"),
    _ruleset_section_header: dynamicHeader("[Ruleset"),
    _unknown_section_header: ($) => seq("[", field("name", $.section_name), "]"),

    assignment: statementRule(($) => $._assignment),
    _conditional_assignment: conditionalStatementRule(
      ($) => $._assignment,
      ($) => $.assignment,
    ),
    _assignment: ($) =>
      seq(
        field("key", $.key),
        $._equals_separator,
        optional(field("value", choice($.module_merge_value, $._assignment_value))),
      ),

    module_merge_value: ($) =>
      seq(
        field("operator", $.merge_operator),
        $._required_whitespace,
        field("value", $._assignment_value),
      ),
    merge_operator: (_) => token(prec(6, choice("%APPEND%", "%INSERT%"))),

    named_declaration: statementRule(($) => $._named_declaration),
    _conditional_named_declaration: conditionalStatementRule(
      ($) => $._named_declaration,
      ($) => $.named_declaration,
    ),
    _named_declaration: ($) =>
      seq(
        field("name", $.declaration_name),
        $._equals_separator,
        $._named_declaration_item,
        repeat(seq($._comma_separator, $._named_declaration_item)),
      ),
    _named_declaration_item: ($) =>
      choice(field("parameter", $.named_parameter), field("argument", $.positional_value)),

    rule: statementRule(($) => $._rule),
    _conditional_rule: conditionalStatementRule(
      ($) => $._rule,
      ($) => $.rule,
    ),
    _rule: ($) =>
      choice(
        prec(
          1,
          seq(
            field("kind", alias("FINAL", $.rule_kind)),
            $._comma_separator,
            field("policy", $.policy),
            repeat(seq($._comma_separator, $._rule_option)),
          ),
        ),
        seq(
          field("kind", $.rule_kind),
          $._comma_separator,
          field("argument", $.positional_value),
          $._comma_separator,
          field("policy", $.policy),
          repeat(seq($._comma_separator, $._rule_option)),
        ),
      ),
    _rule_option: ($) =>
      choice(field("parameter", $.named_parameter), field("option", $.positional_value)),
    policy: ($) => field("value", $._comma_value),

    logical_rule: statementRule(($) => $._logical_rule),
    _conditional_logical_rule: conditionalStatementRule(
      ($) => $._logical_rule,
      ($) => $.logical_rule,
    ),
    _logical_rule: ($) =>
      seq(
        field("condition", $.logical_rule_expression),
        $._comma_separator,
        field("policy", $.policy),
        repeat(seq($._comma_separator, $._rule_option)),
      ),

    ruleset_logical_rule: statementRule(($) => $._ruleset_logical_rule),
    _conditional_ruleset_logical_rule: conditionalStatementRule(
      ($) => $._ruleset_logical_rule,
      ($) => $.ruleset_logical_rule,
    ),
    _ruleset_logical_rule: ($) =>
      seq($._ruleset_logical_line_start, field("condition", $.logical_rule_expression)),
    logical_rule_expression: ($) =>
      choice(
        seq(
          field("operator", alias(choice("AND", "OR"), $.logical_operator)),
          $._comma_separator,
          "(",
          field("operand", $.logical_rule_operand),
          $._comma_separator,
          field("operand", $.logical_rule_operand),
          repeat(seq($._comma_separator, field("operand", $.logical_rule_operand))),
          ")",
        ),
        seq(
          field("operator", alias("NOT", $.logical_operator)),
          $._comma_separator,
          "(",
          field("operand", $.logical_rule_operand),
          ")",
        ),
      ),
    logical_rule_operand: ($) =>
      seq("(", field("expression", choice($.logical_rule_expression, $.rule_predicate)), ")"),
    malformed_logical_rule: ($) => $._malformed_logical_rule,
    _ruleset_malformed_logical_rule: ($) =>
      seq($._ruleset_logical_line_start, $._malformed_logical_rule),
    _malformed_logical_rule: ($) =>
      seq(
        field("operator", alias(choice("AND", "OR", "NOT"), $.logical_operator)),
        $._comma_separator,
        "(",
        repeat(seq(field("operand", $.logical_rule_operand), $._comma_separator)),
        field("operand", $._unterminated_logical_rule_operand),
        $._logical_line_end,
        $._logical_error_sentinel,
      ),
    _unterminated_logical_rule_operand: ($) =>
      seq("(", field("expression", alias($._unterminated_rule_predicate, $.rule_predicate))),
    _unterminated_rule_predicate: ($) =>
      prec.dynamic(
        1,
        seq(
          field("kind", $.rule_kind),
          $._comma_separator,
          field("argument", alias($._logical_positional_value, $.positional_value)),
        ),
      ),
    rule_predicate: ($) =>
      seq(
        field("kind", $.rule_kind),
        repeat1(
          seq(
            $._comma_separator,
            field("argument", alias($._logical_positional_value, $.positional_value)),
          ),
        ),
      ),
    _logical_positional_value: ($) => field("value", valueWithBareForm($, $._logical_bare_value)),
    _logical_bare_value: ($) =>
      repeat1(
        choice(withModulePlaceholders($, $._logical_value_chunk), $._logical_parenthesized_value),
      ),
    _logical_parenthesized_value: ($) =>
      seq(
        "(",
        repeat(
          choice(withModulePlaceholders($, $._logical_value_chunk), $._logical_parenthesized_value),
        ),
        ")",
      ),
    _logical_value_chunk: (_) => token(prec(-1, /(?:\\[()]|[^%,() \t\r\n"'])+/)),
    // The scanner emits the preceding zero-width boundary; this required,
    // unlexable token makes the localized malformed node carry a MISSING error.
    _logical_error_sentinel: (_) => "\0",

    ordered_comma_statement: statementRule(($) => $._ordered_comma_statement),
    _conditional_ordered_comma_statement: conditionalStatementRule(
      ($) => $._ordered_comma_statement,
      ($) => $.ordered_comma_statement,
    ),
    _ordered_comma_statement: ($) =>
      seq(field("kind", $.rule_kind), repeat1(seq($._comma_separator, $._ordered_comma_item))),
    _ordered_comma_item: ($) =>
      choice(field("parameter", $.named_parameter), field("argument", $.positional_value)),

    _url_rewrite_statement: statementRule(($) => $._url_rewrite),
    _header_rewrite_statement: statementRule(($) => $._header_rewrite),
    _body_rewrite_statement: statementRule(($) => $._body_rewrite),
    _map_local_statement: statementRule(($) => $._map_local),
    _conditional_url_rewrite: conditionalStatementRule(
      ($) => $._url_rewrite,
      ($) => $.rewrite,
    ),
    _conditional_header_rewrite: conditionalStatementRule(
      ($) => $._header_rewrite,
      ($) => $.rewrite,
    ),
    _conditional_body_rewrite: conditionalStatementRule(
      ($) => $._body_rewrite,
      ($) => $.rewrite,
    ),
    _conditional_map_local: conditionalStatementRule(
      ($) => $._map_local,
      ($) => $.rewrite,
    ),

    _url_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        optional(seq($._required_whitespace, whitespaceValueField($, "argument"))),
      ),
    _header_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        repeat(seq($._required_whitespace, whitespaceValueField($, "argument"))),
      ),
    _body_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "body"),
        repeat(seq($._required_whitespace, whitespaceValueField($, "body"))),
      ),
    _map_local: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        repeat1(seq($._required_whitespace, whitespaceParameterField($))),
      ),

    _ssid_setting_statement: statementRule(($) => $._ssid_setting),
    _port_forwarding_statement: statementRule(($) => $._port_forwarding),
    _conditional_ssid_setting: conditionalStatementRule(
      ($) => $._ssid_setting,
      ($) => $.whitespace_statement,
    ),
    _conditional_port_forwarding: conditionalStatementRule(
      ($) => $._port_forwarding,
      ($) => $.whitespace_statement,
    ),

    _ssid_setting: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceParameterField($),
        repeat(
          choice(
            seq($._comma_separator, whitespaceParameterField($)),
            seq($._required_whitespace, whitespaceParameterField($)),
          ),
        ),
      ),
    _port_forwarding: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        repeat(seq($._required_whitespace, whitespaceParameterField($))),
      ),

    requirement_prefix: ($) =>
      seq(
        $._requirement_prefix_marker,
        field("expression", $._line_requirement_expression),
        $._required_whitespace,
      ),
    requirement_suffix: ($) =>
      seq($._requirement_suffix_marker, field("expression", $._line_requirement_expression)),
    platform_requirement_prefix: ($) => $._platform_requirement_prefix_marker,
    platform_requirement_suffix: ($) => $._platform_requirement_suffix_marker,
    _line_requirement_expression: ($) =>
      choice($.quoted_requirement_expression, $._requirement_expression),
    quoted_requirement_expression: ($) =>
      seq('"', field("expression", $._requirement_expression), token.immediate('"')),

    _requirement_expression: ($) =>
      choice(
        $.requirement_binary_expression,
        $.requirement_unary_expression,
        $.requirement_group,
        $.requirement_predicate,
      ),
    requirement_binary_expression: ($) =>
      choice(
        prec.left(
          1,
          seq(
            field("left", $._requirement_expression),
            field("operator", alias($._requirement_or_operator, $.requirement_operator)),
            optional($._required_whitespace),
            field("right", $._requirement_expression),
          ),
        ),
        prec.left(
          2,
          seq(
            field("left", $._requirement_expression),
            field("operator", alias($._requirement_and_operator, $.requirement_operator)),
            optional($._required_whitespace),
            field("right", $._requirement_expression),
          ),
        ),
      ),
    requirement_unary_expression: ($) =>
      prec.right(
        3,
        seq(
          field("operator", alias($._requirement_unary_operator, $.requirement_operator)),
          optional($._required_whitespace),
          field("operand", $._requirement_expression),
        ),
      ),
    requirement_group: ($) => seq("(", field("expression", $._requirement_expression), ")"),
    requirement_predicate: ($) =>
      seq(
        field("variable", $.requirement_variable),
        field("operator", alias($._requirement_comparison_operator, $.requirement_operator)),
        optional($._required_whitespace),
        field("value", $.requirement_value),
      ),
    requirement_variable: (_) =>
      choice("CORE_VERSION", "SYSTEM", "SYSTEM_VERSION", "DEVICE_MODEL", "LANGUAGE"),
    requirement_value: ($) =>
      choice(
        $.single_quoted_value,
        $.requirement_number,
        $.requirement_bare_value,
        $.module_argument_placeholder,
      ),
    requirement_number: (_) => token(/[0-9]+(?:\.[0-9]+)*/),
    requirement_bare_value: (_) => token(/[A-Za-z0-9_.:-]+/),

    _directive: ($) =>
      choice(
        $.include_directive,
        $.managed_config_directive,
        $.forbidden_auto_upgrade_directive,
        $.module_name_directive,
        $.module_description_directive,
        $.module_system_directive,
        $.module_arguments_directive,
        $.module_requirement_directive,
        $.directive,
      ),

    include_directive: ($) =>
      seq(
        $._include_marker,
        field("target", $.include_target),
        repeat(seq($._comma_separator, field("target", $.include_target))),
        inlineComment($),
      ),
    include_target: ($) => repeat1(withModulePlaceholders($, $._include_target_chunk)),
    _include_target_chunk: (_) => token(prec(-1, /[^,% \t\r\n]+/)),

    managed_config_directive: ($) =>
      seq(
        $._managed_config_marker,
        field("url", $.managed_config_url),
        repeat(seq($._required_whitespace, whitespaceParameterField($))),
        inlineComment($),
      ),
    managed_config_url: ($) => repeat1(withModulePlaceholders($, $._managed_config_url_chunk)),
    _managed_config_url_chunk: (_) => token(prec(-1, /[^% \t\r\n]+/)),

    forbidden_auto_upgrade_directive: ($) =>
      seq(
        $._forbidden_auto_upgrade_marker,
        field("target", $.forbidden_upgrade_target),
        inlineComment($),
      ),
    forbidden_upgrade_target: (_) => token(/[^ \t\r\n]+/),

    module_name_directive: ($) =>
      seq($._module_name_marker, field("value", $._assignment_value), inlineComment($)),
    module_description_directive: ($) =>
      seq($._module_description_marker, field("value", $._assignment_value), inlineComment($)),
    module_system_directive: ($) =>
      seq($._module_system_marker, field("value", $._assignment_value), inlineComment($)),
    module_arguments_directive: ($) =>
      seq(
        $._module_arguments_marker,
        field("argument", $.module_argument),
        repeat(seq("&", field("argument", $.module_argument))),
        inlineComment($),
      ),
    module_argument: ($) =>
      seq(
        field("name", $.module_argument_name),
        "=",
        optional(field("default", $.module_argument_default)),
      ),
    module_argument_name: (_) => token(/[A-Za-z0-9_]+/),
    module_argument_default: ($) =>
      repeat1(withModulePlaceholders($, $._module_argument_default_chunk)),
    _module_argument_default_chunk: (_) => token(prec(-1, /[^&% \t\r\n]+/)),
    module_requirement_directive: ($) =>
      seq(
        $._module_requirement_marker,
        field("condition", $._requirement_expression),
        inlineComment($),
      ),

    module_argument_placeholder: (_) => token(prec(5, /%[A-Za-z0-9_]+%/)),

    _whitespace_positional_value: ($) => field("value", $._whitespace_value),
    _whitespace_named_parameter: ($) =>
      seq(
        field("key", $.parameter_key),
        token.immediate("="),
        optional(field("value", $._whitespace_parameter_value)),
      ),
    _whitespace_value: ($) => valueWithBareForm($, $._whitespace_bare_value),
    _whitespace_bare_value: ($) => repeat1(withModulePlaceholders($, $._whitespace_value_chunk)),
    _whitespace_value_chunk: (_) => token(prec(-1, /[^%\x5b \t\r\n"']+/)),
    _whitespace_parameter_value: ($) => valueWithBareForm($, $._whitespace_parameter_bare_value),
    _whitespace_parameter_bare_value: ($) =>
      repeat1(withModulePlaceholders($, $._whitespace_parameter_value_chunk)),
    _whitespace_parameter_value_chunk: (_) => token(prec(-1, /[^%, \t\r\n"']+/)),
    _whitespace_unknown_line: ($) =>
      seq(
        $._whitespace_unknown_value,
        repeat(seq($._required_whitespace, $._whitespace_unknown_value)),
        optional($._inline_comment),
      ),
    _whitespace_unknown_value: ($) =>
      choice(
        withModulePlaceholders($, $._whitespace_value_chunk),
        $._opaque_double_quoted_value,
        $._opaque_single_quoted_value,
      ),

    positional_value: ($) => field("value", $._comma_value),
    named_parameter: ($) =>
      seq(field("key", $.parameter_key), "=", optional(field("value", $._parameter_value))),

    _assignment_value: ($) => valueWithBareForm($, $._assignment_bare_value),
    _assignment_bare_value: ($) =>
      seq(
        $._assignment_bare_atom,
        repeat(choice($._assignment_bare_atom, $.double_quoted_value, $.single_quoted_value)),
      ),
    _assignment_bare_atom: ($) => withModulePlaceholders($, $._bare_value_chunk),
    _bare_value_chunk: (_) => token(prec(-1, /[^% \t\r\n"']+/)),

    _comma_value: ($) => valueWithBareForm($, $._comma_bare_value),
    _comma_bare_value: ($) =>
      repeat1(
        choice($._parameter_key_chunk, $._comma_punctuation_chunk, withModulePlaceholders($, "=")),
      ),
    _parameter_key_chunk: (_) => token(/[A-Za-z0-9_][A-Za-z0-9_-]*/),
    _comma_punctuation_chunk: (_) => token(/[^%A-Za-z0-9_,= \t\r\n"']+/),

    _parameter_value: ($) => valueWithBareForm($, $._parameter_bare_value),
    _parameter_bare_value: ($) => repeat1(withModulePlaceholders($, $._parameter_value_chunk)),
    _parameter_value_chunk: (_) => token(prec(-1, /[^%, \t\r\n"']+/)),

    key: ($) => repeat1($._key_chunk),
    declaration_name: ($) => repeat1($._key_chunk),
    parameter_key: ($) => repeat1($._parameter_key_chunk),
    rule_kind: ($) => $._non_comma_chunk,
    _key_chunk: (_) => token(/[^\x5b\r\n= \t]+/),
    double_quoted_value: ($) =>
      seq('"', repeat(withModulePlaceholders($, $._double_quoted_content)), token.immediate('"')),
    single_quoted_value: ($) =>
      seq("'", repeat(withModulePlaceholders($, $._single_quoted_content)), token.immediate("'")),
    _double_quoted_content: (_) => token.immediate(prec(-1, /(?:\\[^\r\n]|[^%"\\\r\n])+/)),
    _single_quoted_content: (_) => token.immediate(prec(-1, /(?:\\[^\r\n]|[^%'\\\r\n])+/)),
    _opaque_double_quoted_value: (_) => token(/"(?:\\[^\r\n]|[^"\\\r\n])*"/),
    _opaque_single_quoted_value: (_) => token(/'(?:\\[^\r\n]|[^'\\\r\n])*'/),
    _literal_percent: (_) => token.immediate(prec(-2, "%")),

    directive: (_) => token(prec(3, /#![^\r\n]*/)),
    comment: (_) => token(prec(2, /(?:#[^\r\n]*|;[^\r\n]*|\/\/[^\r\n]*)/)),
    _inline_comment: (_) => token(prec(2, /[ \t]+(?:#[^\r\n]*|;[^\r\n]*|\/\/[^\r\n]*)/)),
    unknown_line: (_) => token(prec(-2, /[ \t]*[^\x5b\r\n \t][^\r\n]*/)),
    _non_assignment_line: ($) => repeat1($._key_chunk),
    _unknown_declaration_line: ($) =>
      seq(
        repeat1($._key_chunk),
        $._equals_separator,
        optional($._unknown_comma_value),
        repeat(seq($._comma_separator, optional($._unknown_comma_value))),
        optional($._inline_comment),
      ),
    _unknown_comma_line: ($) =>
      seq(
        $._non_comma_chunk,
        repeat(seq($._comma_separator, optional($._unknown_comma_value))),
        optional($._inline_comment),
      ),
    _unknown_comma_value: ($) =>
      repeat1(
        choice(
          $._parameter_key_chunk,
          $._comma_punctuation_chunk,
          withModulePlaceholders($, "="),
          $.double_quoted_value,
          $.single_quoted_value,
        ),
      ),
    _non_comma_chunk: (_) => token(/[^\x5b, \t\r\n]+/),

    _include_marker: (_) => token(prec(5, /#!include[ \t]+/)),
    _managed_config_marker: (_) => token(prec(5, /#!MANAGED-CONFIG[ \t]+/)),
    _forbidden_auto_upgrade_marker: (_) => token(prec(5, /#!FORBIDDEN-AUTO-UPGRADE[ \t]+/)),
    _module_name_marker: (_) => token(prec(5, "#!name=")),
    _module_description_marker: (_) => token(prec(5, "#!desc=")),
    _module_system_marker: (_) => token(prec(5, "#!system=")),
    _module_arguments_marker: (_) => token(prec(5, "#!arguments=")),
    _module_requirement_marker: (_) => token(prec(5, "#!requirement=")),
    _requirement_prefix_marker: (_) => token(prec(5, /#!REQUIREMENT[ \t]+/)),
    _requirement_suffix_marker: (_) => token(prec(5, /[ \t]+(?:#|\/\/)!REQUIREMENT[ \t]+/)),
    _platform_requirement_prefix_marker: (_) => token(prec(5, /#!(?:IOS|MACOS|TVOS)-ONLY[ \t]+/)),
    _platform_requirement_suffix_marker: (_) =>
      token(prec(5, /[ \t]+(?:#|\/\/)!(?:IOS|MACOS|TVOS)-ONLY/)),

    section_name: (_) => token.immediate(/[^\]\r\n \t](?:[^\]\r\n]*[^\]\r\n \t])?/),
    _header_separator: (_) => token.immediate(/[ \t]+/),
    _required_whitespace: (_) => token.immediate(/[ \t]+/),
    _equals_separator: (_) => token.immediate(/[ \t]*=[ \t]*/),
    _comma_separator: (_) => token.immediate(/,[ \t]*/),
    _newline: (_) => /\r?\n/,
  },
});
