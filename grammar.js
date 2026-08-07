/**
 * @file Tree-sitter grammar for Surge configuration documents
 * @author Civi
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const section = (header) => ($) =>
  seq(header($), repeat(seq(repeat1($._newline), $._section_body_item)));

const fixedSection = (header) => section(($) => alias(header, $.section_header));

const namedSection = (header) => section(($) => alias(header($), $.section_header));

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

  conflicts: ($) => sectionRules($).map((sectionRule) => [sectionRule]),

  rules: {
    source_file: ($) =>
      seq(
        repeat(choice($._newline, seq(choice($.comment, $.directive), $._newline))),
        optional(choice($.comment, $.directive, $._section_list)),
      ),

    _section_list: ($) =>
      seq($._section, repeat(seq(repeat1($._newline), $._section)), optional(repeat1($._newline))),

    _section: ($) => choice(...sectionRules($)),

    general_section: fixedSection("[General]"),
    proxy_section: fixedSection("[Proxy]"),
    proxy_group_section: fixedSection("[Proxy Group]"),
    rule_section: fixedSection("[Rule]"),
    host_section: fixedSection("[Host]"),
    url_rewrite_section: fixedSection("[URL Rewrite]"),
    header_rewrite_section: fixedSection("[Header Rewrite]"),
    body_rewrite_section: fixedSection("[Body Rewrite]"),
    map_local_section: fixedSection("[Map Local]"),
    mitm_section: fixedSection("[MITM]"),
    keystore_section: fixedSection("[Keystore]"),
    ssid_setting_section: fixedSection("[SSID Setting]"),
    script_section: fixedSection("[Script]"),
    panel_section: fixedSection("[Panel]"),
    ponte_section: fixedSection("[Ponte]"),
    port_forwarding_section: fixedSection("[Port Forwarding]"),
    testing_section: fixedSection("[Testing]"),
    dhcp_section: fixedSection("[DHCP]"),
    snell_server_section: fixedSection("[Snell Server]"),
    mtproto_section: fixedSection("[MTProto]"),
    wireguard_section: namedSection(($) => $._wireguard_section_header),
    tailscale_section: namedSection(($) => $._tailscale_section_header),
    ruleset_section: namedSection(($) => $._ruleset_section_header),
    unknown_section: namedSection(($) => $._unknown_section_header),

    _wireguard_section_header: dynamicHeader("[WireGuard"),
    _tailscale_section_header: dynamicHeader("[Tailscale"),
    _ruleset_section_header: dynamicHeader("[Ruleset"),
    _unknown_section_header: ($) => seq("[", field("name", $.section_name), "]"),

    _section_body_item: ($) => choice($.comment, $.directive, $.unknown_line),
    directive: (_) => token(prec(2, /[ \t]*#![^\r\n]*/)),
    comment: (_) => token(prec(1, /[ \t]*(?:#[^\r\n]*|;[^\r\n]*|\/\/[^\r\n]*)/)),
    unknown_line: (_) => token(prec(-1, /[ \t]*[^\x5b\r\n \t][^\r\n]*/)),

    section_name: (_) => token.immediate(/[^\]\r\n \t](?:[^\]\r\n]*[^\]\r\n \t])?/),
    _header_separator: (_) => token.immediate(/[ \t]+/),
    _newline: (_) => /\r?\n/,
  },
});
