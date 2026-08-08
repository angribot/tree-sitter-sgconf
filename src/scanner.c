#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

// External boundaries keep recovery on one physical line, distinguish
// recognizable incomplete statements from unknown extensions, and enable
// Ruleset logical syntax only for policy-free or unterminated forms.
enum TokenType {
  PHYSICAL_LINE_END,
  RULESET_LOGICAL_LINE_START,
  INCOMPLETE_RULE_LINE,
  INCOMPLETE_RULESET_LINE,
  INCOMPLETE_NAMED_DECLARATION_LINE,
  INCOMPLETE_TWO_VALUE_WHITESPACE_LINE,
  INCOMPLETE_THREE_VALUE_WHITESPACE_LINE,
  REQUIREMENT_COMPARISON_OPERATOR,
  REQUIREMENT_OR_OPERATOR,
  REQUIREMENT_AND_OPERATOR,
  REQUIREMENT_UNARY_OPERATOR,
  LEADING_BRACKET_VALUE_CHUNK,
};

static bool is_identifier_character(int32_t character) {
  return (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z') ||
         (character >= '0' && character <= '9') || character == '_';
}

static bool is_horizontal_whitespace(int32_t character) {
  return character == ' ' || character == '\t';
}

static bool is_whitespace_value_delimiter(int32_t character) {
  return character == 0 || character == '%' ||
         is_horizontal_whitespace(character) || character == '\r' ||
         character == '\n' || character == '"' || character == '\'';
}

static void skip_horizontal_whitespace(TSLexer *lexer) {
  while (is_horizontal_whitespace(lexer->lookahead)) {
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

static bool scan_leading_bracket_value_chunk(TSLexer *lexer) {
  if (lexer->lookahead != '[') {
    return false;
  }

  bool found_closing_bracket = false;
  bool has_non_whitespace_after_closing_bracket = false;

  while (!is_whitespace_value_delimiter(lexer->lookahead)) {
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);

    if (found_closing_bracket) {
      has_non_whitespace_after_closing_bracket = true;
    } else if (character == ']') {
      found_closing_bracket = true;
    }
  }

  lexer->mark_end(lexer);

  // Let section dispatch own a physical line whose only content is a header.
  while (lexer->lookahead != 0 && lexer->lookahead != '\r' &&
         lexer->lookahead != '\n') {
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);

    if (found_closing_bracket) {
      if (!is_horizontal_whitespace(character)) {
        has_non_whitespace_after_closing_bracket = true;
      }
    } else if (character == ']') {
      found_closing_bracket = true;
    }
  }

  return !found_closing_bracket ||
         has_non_whitespace_after_closing_bracket;
}

// These line shapes mirror only the grammar's required separators. The
// external tokens let a recognizable incomplete prefix outrank unknown_line
// without teaching the parser Surge key or value semantics.
typedef struct {
  unsigned comma_count;
  unsigned first_field_length;
  char first_field[5];
  bool field_has_content[3];
  bool current_field_has_content;
  bool has_empty_field;
  bool first_field_is_final;
  bool first_field_is_logical_operator;
  bool second_field_starts_with_parenthesis;
  bool trailing_comma;
} CommaLineShape;

static bool is_physical_line_end(int32_t character) {
  return character == 0 || character == '\r' || character == '\n';
}

static bool update_quote_state(int32_t character, int32_t *quote,
                               bool *escaped) {
  if (*escaped) {
    *escaped = false;
    return true;
  }
  if (character == '\\') {
    *escaped = true;
    return true;
  }
  if (*quote != 0) {
    if (character == *quote) {
      *quote = 0;
    }
    return true;
  }
  if (character == '\'' || character == '"') {
    *quote = character;
    return true;
  }
  return false;
}

static void record_first_field_character(CommaLineShape *shape,
                                         int32_t character) {
  if (shape->first_field_length < sizeof(shape->first_field)) {
    shape->first_field[shape->first_field_length] = (char)character;
  }
  shape->first_field_length++;
}

static CommaLineShape scan_comma_line_shape(TSLexer *lexer) {
  CommaLineShape shape;
  memset(&shape, 0, sizeof(shape));
  if (lexer->get_column(lexer) != 0) {
    return shape;
  }

  int32_t quote = 0;
  bool escaped = false;

  lexer->mark_end(lexer);
  skip_horizontal_whitespace(lexer);
  if (lexer->lookahead == '#' || lexer->lookahead == ';' ||
      lexer->lookahead == '/') {
    return shape;
  }

  while (!is_physical_line_end(lexer->lookahead)) {
    int32_t character = lexer->lookahead;

    if (quote != 0) {
      lexer->advance(lexer, false);
      shape.trailing_comma = false;
      shape.current_field_has_content = true;
      if (shape.comma_count < 3) {
        shape.field_has_content[shape.comma_count] = true;
      }

      update_quote_state(character, &quote, &escaped);
      continue;
    }

    if (is_horizontal_whitespace(character)) {
      skip_horizontal_whitespace(lexer);
      if (lexer->lookahead == '#' || lexer->lookahead == ';') {
        break;
      }
      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '/') {
          break;
        }
        shape.current_field_has_content = true;
        if (shape.comma_count < 3) {
          shape.field_has_content[shape.comma_count] = true;
        }
        shape.trailing_comma = false;
      }
      continue;
    }

    if (character == ',' || character == '\'' || character == '"') {
      lexer->advance(lexer, false);

      if (character == ',') {
        if (!shape.current_field_has_content) {
          shape.has_empty_field = true;
        }
        shape.current_field_has_content = false;
        shape.comma_count++;
        shape.trailing_comma = true;
      } else {
        quote = character;
        shape.current_field_has_content = true;
        shape.trailing_comma = false;
        if (shape.comma_count < 3) {
          shape.field_has_content[shape.comma_count] = true;
        }
      }
      continue;
    }

    lexer->advance(lexer, false);
    shape.current_field_has_content = true;
    shape.trailing_comma = false;
    if (shape.comma_count < 3) {
      bool field_was_empty = !shape.field_has_content[shape.comma_count];
      shape.field_has_content[shape.comma_count] = true;
      if (shape.comma_count == 1 && field_was_empty && character == '(') {
        shape.second_field_starts_with_parenthesis = true;
      }
    }
    if (shape.comma_count == 0) {
      record_first_field_character(&shape, character);
    }
  }

  shape.first_field_is_final =
      shape.first_field_length == 5 && memcmp(shape.first_field, "FINAL", 5) == 0;
  shape.first_field_is_logical_operator =
      (shape.first_field_length == 2 &&
       memcmp(shape.first_field, "OR", 2) == 0) ||
      (shape.first_field_length == 3 &&
       (memcmp(shape.first_field, "AND", 3) == 0 ||
        memcmp(shape.first_field, "NOT", 3) == 0));
  return shape;
}

static void mark_physical_line(TSLexer *lexer) {
  while (!is_physical_line_end(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }
  lexer->mark_end(lexer);
}

static bool scan_incomplete_rule_line(TSLexer *lexer) {
  CommaLineShape shape = scan_comma_line_shape(lexer);

  if ((!shape.field_has_content[0] && shape.comma_count == 0) ||
      (shape.first_field_is_logical_operator &&
       shape.second_field_starts_with_parenthesis)) {
    return false;
  }

  bool is_incomplete;
  if (shape.first_field_is_final) {
    is_incomplete = shape.comma_count == 0 || !shape.field_has_content[1] ||
                    shape.has_empty_field || shape.trailing_comma;
  } else if (shape.comma_count == 0) {
    is_incomplete = false;
  } else if (shape.comma_count == 1) {
    is_incomplete = true;
  } else {
    is_incomplete = !shape.field_has_content[0] ||
                    !shape.field_has_content[1] ||
                    !shape.field_has_content[2] || shape.has_empty_field ||
                    shape.trailing_comma;
  }

  if (is_incomplete) {
    mark_physical_line(lexer);
  }
  return is_incomplete;
}

static bool scan_incomplete_ruleset_line(TSLexer *lexer) {
  CommaLineShape shape = scan_comma_line_shape(lexer);
  bool is_logical = shape.first_field_is_logical_operator &&
                    shape.second_field_starts_with_parenthesis;
  bool is_incomplete =
      !is_logical && shape.comma_count > 0 &&
      (!shape.field_has_content[0] || shape.has_empty_field ||
       shape.trailing_comma);
  if (is_incomplete) {
    mark_physical_line(lexer);
  }
  return is_incomplete;
}

static bool scan_incomplete_named_declaration_line(TSLexer *lexer) {
  if (lexer->get_column(lexer) != 0) {
    return false;
  }

  lexer->mark_end(lexer);
  skip_horizontal_whitespace(lexer);
  if (lexer->lookahead == '#' || lexer->lookahead == ';' ||
      lexer->lookahead == '/') {
    return false;
  }

  bool has_name = false;
  bool has_equals_separator = false;
  bool current_item_has_content = false;
  bool has_empty_item = false;
  bool trailing_separator = false;
  int32_t quote = 0;
  bool escaped = false;

  while (!is_physical_line_end(lexer->lookahead)) {
    int32_t character = lexer->lookahead;

    if (quote != 0) {
      lexer->advance(lexer, false);
      current_item_has_content = true;
      trailing_separator = false;
      update_quote_state(character, &quote, &escaped);
      continue;
    }

    if (is_horizontal_whitespace(character)) {
      skip_horizontal_whitespace(lexer);
      if (lexer->lookahead == '#' || lexer->lookahead == ';') {
        break;
      }
      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '/') {
          break;
        }
        if (has_equals_separator) {
          current_item_has_content = true;
          trailing_separator = false;
        } else {
          has_name = true;
        }
      }
      continue;
    }

    lexer->advance(lexer, false);
    if (character == '\'' || character == '"') {
      quote = character;
    }

    if (!has_equals_separator) {
      if (character == '=') {
        has_equals_separator = true;
        trailing_separator = true;
      } else {
        has_name = true;
      }
      continue;
    }

    if (character == ',') {
      if (!current_item_has_content) {
        has_empty_item = true;
      }
      current_item_has_content = false;
      trailing_separator = true;
    } else {
      current_item_has_content = true;
      trailing_separator = false;
    }
  }

  bool is_incomplete = has_equals_separator &&
                       (!has_name || !current_item_has_content ||
                        has_empty_item || trailing_separator);
  if (is_incomplete) {
    mark_physical_line(lexer);
  }
  return is_incomplete;
}

static bool scan_incomplete_whitespace_line(TSLexer *lexer,
                                             unsigned required_values) {
  if (lexer->get_column(lexer) != 0) {
    return false;
  }

  lexer->mark_end(lexer);
  skip_horizontal_whitespace(lexer);

  bool starts_with_bracket = lexer->lookahead == '[';
  int32_t last_character = 0;
  unsigned value_count = 0;

  while (!is_physical_line_end(lexer->lookahead)) {
    if (lexer->lookahead == '#' || lexer->lookahead == ';') {
      break;
    }

    bool consumed_slash = false;
    if (lexer->lookahead == '/') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '/') {
        break;
      }
      consumed_slash = true;
    }

    value_count++;
    int32_t quote = 0;
    bool escaped = false;
    if (consumed_slash) {
      last_character = '/';
    }

    while (!is_physical_line_end(lexer->lookahead) &&
           (quote != 0 || !is_horizontal_whitespace(lexer->lookahead))) {
      int32_t character = lexer->lookahead;
      lexer->advance(lexer, false);
      last_character = character;
      update_quote_state(character, &quote, &escaped);
    }

    skip_horizontal_whitespace(lexer);
  }

  bool is_incomplete =
      !(starts_with_bracket && last_character == ']') && value_count > 0 &&
      value_count < required_values;
  if (is_incomplete) {
    mark_physical_line(lexer);
  }
  return is_incomplete;
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

    if (update_quote_state(character, &quote, &escaped)) {
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

  if (valid_symbols[PHYSICAL_LINE_END] &&
      (lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
    lexer->result_symbol = PHYSICAL_LINE_END;
    return true;
  }

  if (valid_symbols[LEADING_BRACKET_VALUE_CHUNK] &&
      scan_leading_bracket_value_chunk(lexer)) {
    lexer->result_symbol = LEADING_BRACKET_VALUE_CHUNK;
    return true;
  }

  if (valid_symbols[RULESET_LOGICAL_LINE_START] &&
      scan_ruleset_logical_line_start(lexer)) {
    lexer->result_symbol = RULESET_LOGICAL_LINE_START;
    return true;
  }

  bool is_error_recovery =
      valid_symbols[INCOMPLETE_RULE_LINE] &&
      valid_symbols[INCOMPLETE_RULESET_LINE] &&
      valid_symbols[INCOMPLETE_NAMED_DECLARATION_LINE] &&
      valid_symbols[INCOMPLETE_TWO_VALUE_WHITESPACE_LINE] &&
      valid_symbols[INCOMPLETE_THREE_VALUE_WHITESPACE_LINE];

  // Tree-sitter marks every external token valid while recovering. Refusing
  // the incomplete-line tokens there prevents them from hiding the original
  // localized error in unrelated syntax families.
  if (!is_error_recovery) {
    if (valid_symbols[INCOMPLETE_RULE_LINE]) {
      if (!scan_incomplete_rule_line(lexer)) {
        return false;
      }
      lexer->result_symbol = INCOMPLETE_RULE_LINE;
      return true;
    }

    if (valid_symbols[INCOMPLETE_RULESET_LINE]) {
      if (!scan_incomplete_ruleset_line(lexer)) {
        return false;
      }
      lexer->result_symbol = INCOMPLETE_RULESET_LINE;
      return true;
    }

    if (valid_symbols[INCOMPLETE_NAMED_DECLARATION_LINE]) {
      if (!scan_incomplete_named_declaration_line(lexer)) {
        return false;
      }
      lexer->result_symbol = INCOMPLETE_NAMED_DECLARATION_LINE;
      return true;
    }

    if (valid_symbols[INCOMPLETE_TWO_VALUE_WHITESPACE_LINE]) {
      if (!scan_incomplete_whitespace_line(lexer, 2)) {
        return false;
      }
      lexer->result_symbol = INCOMPLETE_TWO_VALUE_WHITESPACE_LINE;
      return true;
    }

    if (valid_symbols[INCOMPLETE_THREE_VALUE_WHITESPACE_LINE]) {
      if (!scan_incomplete_whitespace_line(lexer, 3)) {
        return false;
      }
      lexer->result_symbol = INCOMPLETE_THREE_VALUE_WHITESPACE_LINE;
      return true;
    }
  }

  enum TokenType operator_type;
  if (!scan_requirement_operator(lexer, valid_symbols, &operator_type)) {
    return false;
  }

  lexer->result_symbol = operator_type;
  return true;
}
