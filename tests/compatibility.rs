use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const FIXTURE_ROOT: &str = "test/fixtures/compatibility";
const LARGE_RULE_FIXTURE: &str = "documented/large-rule-profile.conf";
const LARGE_RULE_COUNT: usize = 10_001;

#[derive(Debug)]
struct Fixture {
    path: String,
    parser_expectation: String,
    surge_expectation: String,
    top_level_kinds: Vec<String>,
    source: String,
}

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(FIXTURE_ROOT)
}

fn parser() -> tree_sitter::Parser {
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_sgconf::LANGUAGE.into())
        .expect("Error loading Surge Configuration Language parser");
    parser
}

fn load_manifest() -> Vec<Fixture> {
    let manifest_path = fixture_root().join("manifest.tsv");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", manifest_path.display()));

    manifest
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.is_empty() && !line.starts_with('#'))
        .map(|(line_index, line)| {
            let columns: Vec<_> = line.split('\t').collect();
            assert_eq!(
                columns.len(),
                5,
                "manifest line {} must have five tab-separated columns",
                line_index + 1
            );

            Fixture {
                path: columns[0].to_owned(),
                parser_expectation: columns[1].to_owned(),
                surge_expectation: columns[2].to_owned(),
                top_level_kinds: columns[3].split(',').map(str::to_owned).collect(),
                source: columns[4].to_owned(),
            }
        })
        .collect()
}

fn collect_fixture_paths(root: &Path, directory: &Path, paths: &mut BTreeSet<String>) {
    for entry in fs::read_dir(directory)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
    {
        let path = entry
            .expect("failed to read fixture directory entry")
            .path();
        if path.is_dir() {
            collect_fixture_paths(root, &path, paths);
            continue;
        }

        let extension = path.extension().and_then(|extension| extension.to_str());
        if matches!(extension, Some("conf" | "dconf" | "sgmodule")) {
            let relative_path = path
                .strip_prefix(root)
                .expect("fixture is outside compatibility root")
                .to_string_lossy()
                .replace('\\', "/");
            paths.insert(relative_path);
        }
    }
}

fn count_kind(node: tree_sitter::Node<'_>, kind: &str) -> usize {
    let mut count = usize::from(node.kind() == kind);
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        count += count_kind(child, kind);
    }
    count
}

#[test]
fn manifest_lists_every_compatibility_fixture() {
    let fixtures = load_manifest();
    let listed_paths: BTreeSet<_> = fixtures
        .iter()
        .map(|fixture| fixture.path.clone())
        .collect();
    let root = fixture_root();
    let mut committed_paths = BTreeSet::new();
    collect_fixture_paths(&root, &root, &mut committed_paths);

    assert_eq!(listed_paths, committed_paths);
    assert_eq!(
        listed_paths.len(),
        fixtures.len(),
        "manifest paths must be unique"
    );

    for fixture in fixtures {
        let category = fixture.path.split('/').next().unwrap_or_default();
        assert!(
            matches!(category, "documented" | "surge-validated" | "recovery"),
            "{} has an unknown compatibility category",
            fixture.path
        );
        assert!(
            matches!(
                fixture.parser_expectation.as_str(),
                "clean" | "localized-error"
            ),
            "{} has an unknown parser expectation",
            fixture.path
        );
        assert!(
            matches!(
                fixture.surge_expectation.as_str(),
                "accepted" | "rejected" | "not-applicable"
            ),
            "{} has an unknown Surge expectation",
            fixture.path
        );
        assert!(
            fixture.source.starts_with("https://manual.nssurge.com/")
                || fixture.source.starts_with("surge-cli:")
                || fixture.source.starts_with("recovery:"),
            "{} has no official source, Surge validation, or recovery rationale",
            fixture.path
        );
    }
}

#[test]
fn compatibility_fixtures_match_the_recorded_public_cst() {
    let mut parser = parser();

    for fixture in load_manifest() {
        let path = fixture_root().join(&fixture.path);
        let source = fs::read(&path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
        let tree = parser
            .parse(&source, None)
            .unwrap_or_else(|| panic!("parser returned no tree for {}", fixture.path));
        let root = tree.root_node();
        let mut cursor = root.walk();
        let top_level_kinds: Vec<_> = root
            .named_children(&mut cursor)
            .map(|node| node.kind().to_owned())
            .collect();

        assert_eq!(root.kind(), "source_file", "{}", fixture.path);
        assert_eq!(
            root.has_error(),
            fixture.parser_expectation == "localized-error",
            "{} produced an unexpected error state: {}",
            fixture.path,
            root.to_sexp()
        );
        assert_eq!(
            top_level_kinds,
            fixture.top_level_kinds,
            "{} produced unexpected top-level CST nodes: {}",
            fixture.path,
            root.to_sexp()
        );
    }
}

#[test]
fn recovery_fixtures_preserve_the_following_valid_constructs() {
    let mut parser = parser();

    for fixture in load_manifest()
        .into_iter()
        .filter(|fixture| fixture.parser_expectation == "localized-error")
    {
        let path = fixture_root().join(&fixture.path);
        let source = fs::read(&path)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
        let tree = parser
            .parse(&source, None)
            .unwrap_or_else(|| panic!("parser returned no tree for {}", fixture.path));
        let root = tree.root_node();
        let mut cursor = root.walk();
        let sections: Vec<_> = root.named_children(&mut cursor).collect();
        let final_section = sections.last().expect("recovery fixture has no section");

        assert_eq!(final_section.kind(), "general_section", "{}", fixture.path);
        assert!(!final_section.has_error(), "{}", fixture.path);
        assert!(
            source[final_section.byte_range()].starts_with(b"[General]\nrecovered = true"),
            "{} did not recover at the expected General section",
            fixture.path
        );
    }
}

#[test]
fn large_synthetic_rule_fixture_has_the_expected_shape() {
    let path = fixture_root().join(LARGE_RULE_FIXTURE);
    let source = fs::read(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    let tree = parser()
        .parse(&source, None)
        .expect("parser returned no tree for large synthetic fixture");
    let root = tree.root_node();

    assert!(!root.has_error());
    assert_eq!(count_kind(root, "rule"), LARGE_RULE_COUNT);
}
