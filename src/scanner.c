#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>

// External boundaries keep malformed logical rules on one physical line and
// only enable Ruleset logical syntax for policy-free or unterminated forms.
enum TokenType {
  LOGICAL_LINE_END,
  RULESET_LOGICAL_LINE_START,
  REQUIREMENT_COMPARISON_OPERATOR,
  REQUIREMENT_OR_OPERATOR,
  REQUIREMENT_AND_OPERATOR,
  REQUIREMENT_UNARY_OPERATOR,
};

static bool is_identifier_character(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') ||
         (character >= '0' && character <= '9') || character == '_';
}

static void skip_horizontal_whitespace(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, true);
  }
}

static bool scan_character(TSLexer *lexer, int32_t expected) {
  if (lexer->lookahead != expected) {
    return false;
  }

  lexer->advance(lexer, false);
  return true;
}

static bool scan_literal(TSLexer *lexer, const char *literal) {
  for (const char *character = literal; *character != '\0'; character++) {
    if (!scan_character(lexer, *character)) {
      return false;
    }
  }

  return true;
}

static bool scan_word(TSLexer *lexer, const char *word) {
  if (!scan_literal(lexer, word) || is_identifier_character(lexer->lookahead)) {
    return false;
  }

  lexer->mark_end(lexer);
  return true;
}

static bool scan_ruleset_logical_line_start(TSLexer *lexer) {
  lexer->mark_end(lexer);

  bool has_logical_operator =
      (lexer->lookahead == 'A' && scan_literal(lexer, "AND")) ||
      (lexer->lookahead == 'O' && scan_literal(lexer, "OR")) ||
      (lexer->lookahead == 'N' && scan_literal(lexer, "NOT"));
  if (!has_logical_operator || !scan_character(lexer, ',')) {
    return false;
  }

  skip_horizontal_whitespace(lexer);
  if (!scan_character(lexer, '(')) {
    return false;
  }

  skip_horizontal_whitespace(lexer);
  if (lexer->lookahead != '(') {
    return false;
  }

  unsigned depth = 1;
  int32_t quote = 0;
  bool escaped = false;

  while (lexer->lookahead != 0 && lexer->lookahead != '\r' &&
         lexer->lookahead != '\n') {
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character == '\\') {
      escaped = true;
      continue;
    }

    if (quote != 0) {
      if (character == quote) {
        quote = 0;
      }
      continue;
    }

    if (character == '\'' || character == '"') {
      quote = character;
      continue;
    }

    if (character == '(') {
      depth++;
      continue;
    }

    if (character != ')') {
      continue;
    }

    if (depth == 0) {
      return false;
    }

    depth--;
    if (depth == 0) {
      break;
    }
  }

  if (depth > 0) {
    return true;
  }

  bool has_trailing_whitespace =
      lexer->lookahead == ' ' || lexer->lookahead == '\t';
  skip_horizontal_whitespace(lexer);

  if (lexer->lookahead == 0 || lexer->lookahead == '\r' ||
      lexer->lookahead == '\n') {
    return true;
  }

  if (!has_trailing_whitespace) {
    return false;
  }

  if (lexer->lookahead == '#' || lexer->lookahead == ';') {
    return true;
  }

  return lexer->lookahead == '/' && scan_character(lexer, '/') &&
         scan_character(lexer, '/');
}

static bool scan_comparison_operator(TSLexer *lexer) {
  switch (lexer->lookahead) {
  case '=':
    lexer->advance(lexer, false);
    if (lexer->lookahead == '=' || lexer->lookahead == '>' ||
        lexer->lookahead == '<') {
      lexer->advance(lexer, false);
    }
    lexer->mark_end(lexer);
    return true;
  case '>':
    lexer->advance(lexer, false);
    if (lexer->lookahead == '=') {
      lexer->advance(lexer, false);
    }
    lexer->mark_end(lexer);
    return true;
  case '<':
    lexer->advance(lexer, false);
    if (lexer->lookahead == '=' || lexer->lookahead == '>') {
      lexer->advance(lexer, false);
    }
    lexer->mark_end(lexer);
    return true;
  case '!':
    lexer->advance(lexer, false);
    if (!scan_character(lexer, '=')) {
      return false;
    }
    lexer->mark_end(lexer);
    return true;
  case 'B':
    return scan_word(lexer, "BEGINSWITH");
  case 'C':
    return scan_word(lexer, "CONTAINS");
  case 'E':
    return scan_word(lexer, "ENDSWITH");
  case 'L':
    return scan_word(lexer, "LIKE");
  case 'M':
    return scan_word(lexer, "MATCHES");
  default:
    return false;
  }
}

static bool scan_requirement_operator(TSLexer *lexer,
                                      const bool *valid_symbols,
                                      enum TokenType *operator_type) {
  if (!valid_symbols[REQUIREMENT_COMPARISON_OPERATOR] &&
      !valid_symbols[REQUIREMENT_OR_OPERATOR] &&
      !valid_symbols[REQUIREMENT_AND_OPERATOR] &&
      !valid_symbols[REQUIREMENT_UNARY_OPERATOR]) {
    return false;
  }

  skip_horizontal_whitespace(lexer);

  if (valid_symbols[REQUIREMENT_COMPARISON_OPERATOR] &&
      scan_comparison_operator(lexer)) {
    *operator_type = REQUIREMENT_COMPARISON_OPERATOR;
    return true;
  }

  if (valid_symbols[REQUIREMENT_OR_OPERATOR]) {
    if ((lexer->lookahead == 'O' && scan_word(lexer, "OR")) ||
        (lexer->lookahead == '|' && scan_character(lexer, '|') &&
         scan_character(lexer, '|'))) {
      if (lexer->lookahead == ',') {
        return false;
      }
      lexer->mark_end(lexer);
      *operator_type = REQUIREMENT_OR_OPERATOR;
      return true;
    }
  }

  if (valid_symbols[REQUIREMENT_AND_OPERATOR]) {
    if ((lexer->lookahead == 'A' && scan_word(lexer, "AND")) ||
        (lexer->lookahead == '&' && scan_character(lexer, '&') &&
         scan_character(lexer, '&'))) {
      if (lexer->lookahead == ',') {
        return false;
      }
      lexer->mark_end(lexer);
      *operator_type = REQUIREMENT_AND_OPERATOR;
      return true;
    }
  }

  if (valid_symbols[REQUIREMENT_UNARY_OPERATOR]) {
    if ((lexer->lookahead == 'N' && scan_word(lexer, "NOT")) ||
        (lexer->lookahead == '!' && scan_character(lexer, '!'))) {
      lexer->mark_end(lexer);
      *operator_type = REQUIREMENT_UNARY_OPERATOR;
      return true;
    }
  }

  return false;
}

void *tree_sitter_sgconf_external_scanner_create(void) { return NULL; }

void tree_sitter_sgconf_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_sgconf_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_sgconf_external_scanner_deserialize(void *payload,
                                                      const char *buffer,
                                                      unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_sgconf_external_scanner_scan(void *payload, TSLexer *lexer,
                                              const bool *valid_symbols) {
  (void)payload;

  if (valid_symbols[LOGICAL_LINE_END] &&
      (lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
    lexer->result_symbol = LOGICAL_LINE_END;
    return true;
  }

  if (valid_symbols[RULESET_LOGICAL_LINE_START] &&
      scan_ruleset_logical_line_start(lexer)) {
    lexer->result_symbol = RULESET_LOGICAL_LINE_START;
    return true;
  }

  enum TokenType operator_type;
  if (!scan_requirement_operator(lexer, valid_symbols, &operator_type)) {
    return false;
  }

  lexer->result_symbol = operator_type;
  return true;
}
