#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>

// The line-end token lets malformed logical rules recover before a physical
// newline instead of searching the following statement for closing delimiters.
enum TokenType {
  LOGICAL_LINE_END,
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

static bool scan_word(TSLexer *lexer, const char *word) {
  for (const char *character = word; *character != '\0'; character++) {
    if (!scan_character(lexer, *character)) {
      return false;
    }
  }

  if (is_identifier_character(lexer->lookahead)) {
    return false;
  }

  lexer->mark_end(lexer);
  return true;
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

  enum TokenType operator_type;
  if (!scan_requirement_operator(lexer, valid_symbols, &operator_type)) {
    return false;
  }

  lexer->result_symbol = operator_type;
  return true;
}
