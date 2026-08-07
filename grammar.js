/**
 * @file Tree-sitter grammar for Surge configuration documents
 * @author Civi
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const doubleQuotedValuePattern = /"(?:\\[^\r\n]|[^"\\\r\n])*"/;
const singleQuotedValuePattern = /'(?:\\[^\r\n]|[^'\\\r\n])*'/;

const inlineComment = ($) => optional(field("comment", alias($._inline_comment, $.comment)));

const whitespaceValueField = ($, name) =>
  field(name, alias($._whitespace_positional_value, $.positional_value));

const whitespaceParameterField = ($) =>
  field("parameter", alias($._whitespace_named_parameter, $.named_parameter));

const valueWithBareForm = ($, bareValue) =>
  choice($.double_quoted_value, $.single_quoted_value, alias(bareValue, $.bare_value));

const unknownSectionBodyItem = ($) => choice($.comment, $.directive, $.unknown_line);

const assignmentSectionBodyItem = ($) =>
  choice($.comment, $.directive, $.assignment, alias($._non_assignment_line, $.unknown_line));

const namedDeclarationSectionBodyItem = ($) =>
  choice(
    $.comment,
    $.directive,
    prec.dynamic(1, $.named_declaration),
    alias(prec.dynamic(-1, $._unknown_declaration_line), $.unknown_line),
    alias($._non_assignment_line, $.unknown_line),
  );

const ruleSectionBodyItem = ($) =>
  choice(
    $.comment,
    $.directive,
    alias($._logical_rule_line, $.unknown_line),
    prec.dynamic(1, $.rule),
    alias(prec.dynamic(-1, $._unknown_comma_line), $.unknown_line),
  );

const orderedCommaSectionBodyItem = ($) =>
  choice(
    $.comment,
    $.directive,
    prec.dynamic(1, $.ordered_comma_statement),
    alias(prec.dynamic(-1, $._unknown_comma_line), $.unknown_line),
  );

const rewriteSectionBodyItem = (rewriteRule) => ($) =>
  choice(
    $.comment,
    $.directive,
    alias(prec.dynamic(1, rewriteRule($)), $.rewrite),
    alias(prec.dynamic(-1, $._whitespace_unknown_line), $.unknown_line),
  );

const whitespaceSectionBodyItem = (statementRule) => ($) =>
  choice(
    $.comment,
    $.directive,
    alias(prec.dynamic(1, statementRule($)), $.whitespace_statement),
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

  conflicts: ($) => [
    ...sectionRules($).map((sectionRule) => [sectionRule]),
    [$.key],
    [$._comma_value, $.parameter_key],
    [$._whitespace_bare_value, $._whitespace_unknown_value],
    [$.double_quoted_value, $._whitespace_unknown_value],
    [$.single_quoted_value, $._whitespace_unknown_value],
    [$.rule_kind, $._unknown_comma_line],
    [$.declaration_name, $._unknown_declaration_line],
  ],

  rules: {
    source_file: ($) =>
      seq(
        repeat(choice($._newline, seq(choice($.comment, $.directive), $._newline))),
        optional(choice($.comment, $.directive, $._section_list)),
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
      rewriteSectionBodyItem(($) => $._url_rewrite),
    ),
    header_rewrite_section: fixedSection(
      "[Header Rewrite]",
      rewriteSectionBodyItem(($) => $._header_rewrite),
    ),
    body_rewrite_section: fixedSection(
      "[Body Rewrite]",
      rewriteSectionBodyItem(($) => $._body_rewrite),
    ),
    map_local_section: fixedSection(
      "[Map Local]",
      rewriteSectionBodyItem(($) => $._map_local),
    ),
    mitm_section: fixedSection("[MITM]", assignmentSectionBodyItem),
    keystore_section: fixedSection("[Keystore]", namedDeclarationSectionBodyItem),
    ssid_setting_section: fixedSection(
      "[SSID Setting]",
      whitespaceSectionBodyItem(($) => $._ssid_setting),
    ),
    script_section: fixedSection("[Script]", namedDeclarationSectionBodyItem),
    panel_section: fixedSection("[Panel]", namedDeclarationSectionBodyItem),
    ponte_section: fixedSection("[Ponte]", assignmentSectionBodyItem),
    port_forwarding_section: fixedSection(
      "[Port Forwarding]",
      whitespaceSectionBodyItem(($) => $._port_forwarding),
    ),
    testing_section: fixedSection("[Testing]", assignmentSectionBodyItem),
    dhcp_section: fixedSection("[DHCP]", assignmentSectionBodyItem),
    snell_server_section: fixedSection("[Snell Server]", assignmentSectionBodyItem),
    mtproto_section: fixedSection("[MTProto]", assignmentSectionBodyItem),
    wireguard_section: namedSection(($) => $._wireguard_section_header, assignmentSectionBodyItem),
    tailscale_section: namedSection(($) => $._tailscale_section_header, assignmentSectionBodyItem),
    ruleset_section: namedSection(($) => $._ruleset_section_header, orderedCommaSectionBodyItem),
    unknown_section: namedSection(($) => $._unknown_section_header),

    _wireguard_section_header: dynamicHeader("[WireGuard"),
    _tailscale_section_header: dynamicHeader("[Tailscale"),
    _ruleset_section_header: dynamicHeader("[Ruleset"),
    _unknown_section_header: ($) => seq("[", field("name", $.section_name), "]"),

    assignment: ($) =>
      seq(
        field("key", $.key),
        "=",
        optional(field("value", $._assignment_value)),
        inlineComment($),
      ),

    named_declaration: ($) =>
      seq(
        field("name", $.declaration_name),
        $._declaration_separator,
        $._named_declaration_item,
        repeat(seq($._comma_separator, $._named_declaration_item)),
        inlineComment($),
      ),
    _named_declaration_item: ($) =>
      choice(field("parameter", $.named_parameter), field("argument", $.positional_value)),

    rule: ($) =>
      choice(
        prec(
          1,
          seq(
            field("kind", alias("FINAL", $.rule_kind)),
            $._comma_separator,
            field("policy", $.policy),
            repeat(seq($._comma_separator, $._rule_option)),
            inlineComment($),
          ),
        ),
        seq(
          field("kind", $.rule_kind),
          $._comma_separator,
          field("argument", $.positional_value),
          $._comma_separator,
          field("policy", $.policy),
          repeat(seq($._comma_separator, $._rule_option)),
          inlineComment($),
        ),
      ),
    _rule_option: ($) =>
      choice(field("parameter", $.named_parameter), field("option", $.positional_value)),
    policy: ($) => field("value", $._comma_value),

    ordered_comma_statement: ($) =>
      seq(
        field("kind", $.rule_kind),
        repeat1(seq($._comma_separator, $._ordered_comma_item)),
        inlineComment($),
      ),
    _ordered_comma_item: ($) =>
      choice(field("parameter", $.named_parameter), field("argument", $.positional_value)),

    _url_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        optional(seq($._required_whitespace, whitespaceValueField($, "argument"))),
        inlineComment($),
      ),
    _header_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        repeat(seq($._required_whitespace, whitespaceValueField($, "argument"))),
        inlineComment($),
      ),
    _body_rewrite: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "body"),
        repeat(seq($._required_whitespace, whitespaceValueField($, "body"))),
        inlineComment($),
      ),
    _map_local: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        repeat1(seq($._required_whitespace, whitespaceParameterField($))),
        inlineComment($),
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
        inlineComment($),
      ),
    _port_forwarding: ($) =>
      seq(
        whitespaceValueField($, "argument"),
        $._required_whitespace,
        whitespaceValueField($, "argument"),
        repeat(seq($._required_whitespace, whitespaceParameterField($))),
        inlineComment($),
      ),

    _whitespace_positional_value: ($) => field("value", $._whitespace_value),
    _whitespace_named_parameter: ($) =>
      seq(
        field("key", $.parameter_key),
        token.immediate("="),
        optional(field("value", $._whitespace_parameter_value)),
      ),
    _whitespace_value: ($) => valueWithBareForm($, $._whitespace_bare_value),
    _whitespace_bare_value: ($) => $._whitespace_value_chunk,
    _whitespace_value_chunk: (_) => token(prec(-1, /[^\x5b \t\r\n"']+/)),
    _whitespace_parameter_value: ($) => valueWithBareForm($, $._whitespace_parameter_bare_value),
    _whitespace_parameter_bare_value: ($) => $._whitespace_parameter_value_chunk,
    _whitespace_parameter_value_chunk: (_) => token(prec(-1, /[^, \t\r\n"']+/)),
    _whitespace_unknown_line: ($) =>
      seq(
        $._whitespace_unknown_value,
        repeat(seq($._required_whitespace, $._whitespace_unknown_value)),
        optional($._inline_comment),
      ),
    _whitespace_unknown_value: ($) =>
      choice($._whitespace_value_chunk, $._double_quoted_value, $._single_quoted_value),

    positional_value: ($) => field("value", $._comma_value),
    named_parameter: ($) =>
      seq(field("key", $.parameter_key), "=", optional(field("value", $._parameter_value))),

    _assignment_value: ($) => valueWithBareForm($, $._assignment_bare_value),
    _assignment_bare_value: ($) =>
      seq(
        $._bare_value_chunk,
        repeat(choice($._bare_value_chunk, $.double_quoted_value, $.single_quoted_value)),
      ),
    _bare_value_chunk: (_) => token(prec(-1, /[^ \t\r\n"']+/)),

    _comma_value: ($) => valueWithBareForm($, $._comma_bare_value),
    _comma_bare_value: ($) =>
      repeat1(choice($._parameter_key_chunk, $._comma_punctuation_chunk, "=")),
    _parameter_key_chunk: (_) => token(/[A-Za-z0-9_][A-Za-z0-9_-]*/),
    _comma_punctuation_chunk: (_) => token(/[^A-Za-z0-9_,= \t\r\n"']+/),

    _parameter_value: ($) => valueWithBareForm($, $._parameter_bare_value),
    _parameter_bare_value: ($) => repeat1($._parameter_value_chunk),
    _parameter_value_chunk: (_) => token(prec(-1, /[^, \t\r\n"']+/)),

    key: ($) => repeat1($._key_chunk),
    declaration_name: ($) => repeat1($._key_chunk),
    parameter_key: ($) => repeat1($._parameter_key_chunk),
    rule_kind: ($) => $._non_comma_chunk,
    _key_chunk: (_) => token(/[^\x5b\r\n= \t]+/),
    double_quoted_value: ($) => $._double_quoted_value,
    single_quoted_value: ($) => $._single_quoted_value,
    _double_quoted_value: (_) => token(doubleQuotedValuePattern),
    _single_quoted_value: (_) => token(singleQuotedValuePattern),

    directive: (_) => token(prec(3, /#![^\r\n]*/)),
    comment: (_) => token(prec(2, /(?:#[^\r\n]*|;[^\r\n]*|\/\/[^\r\n]*)/)),
    _inline_comment: (_) => token(prec(2, /[ \t]+(?:#[^\r\n]*|;[^\r\n]*|\/\/[^\r\n]*)/)),
    unknown_line: (_) => token(prec(-2, /[ \t]*[^\x5b\r\n \t][^\r\n]*/)),
    _non_assignment_line: ($) => repeat1($._key_chunk),
    _unknown_declaration_line: ($) =>
      seq(
        repeat1($._key_chunk),
        $._declaration_separator,
        optional($._unknown_comma_value),
        repeat(seq($._comma_separator, optional($._unknown_comma_value))),
        optional($._inline_comment),
      ),
    _logical_rule_line: (_) => token(prec(4, /(?:AND|OR|NOT),[^\r\n]*/)),
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
          "=",
          $._double_quoted_value,
          $._single_quoted_value,
        ),
      ),
    _non_comma_chunk: (_) => token(/[^\x5b, \t\r\n]+/),

    section_name: (_) => token.immediate(/[^\]\r\n \t](?:[^\]\r\n]*[^\]\r\n \t])?/),
    _header_separator: (_) => token.immediate(/[ \t]+/),
    _required_whitespace: (_) => token.immediate(/[ \t]+/),
    _declaration_separator: (_) => token.immediate(/[ \t]*=[ \t]*/),
    _comma_separator: (_) => token.immediate(/,[ \t]*/),
    _newline: (_) => /\r?\n/,
  },
});
