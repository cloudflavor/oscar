use crate::{Changes, Config};
use std::path::PathBuf;

pub fn filter_labels(config: Config, changes: Changes) -> impl Iterator<Item = String> {
    let changes_paths: Vec<PathBuf> = changes
        .changes
        .into_iter()
        .map(|change| PathBuf::from(change.new_path))
        .collect();

    config.labels.into_iter().filter_map(move |label| {
        if label.paths.iter().any(|label_path| {
            changes_paths
                .iter()
                .any(|change_path| change_path.starts_with(label_path))
        }) {
            Some(label.name)
        } else {
            None
        }
    })
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::{Change, Label};

    #[test]
    fn test_labels_filtering() {
        // Scenario 1: Single label matches
        let config = create_config(vec![
            ("label1", vec!["path/to/foo"]),
            ("label2", vec!["path/to/bar"]),
        ]);
        let changes = create_changes(vec!["path/to/foo/file1", "path/other"]);
        let filtered_labels = filter_labels(config, changes).collect::<Vec<_>>();
        assert_eq!(filtered_labels, vec!["label1".to_string()]);

        // Scenario 2: Multiple labels match
        let config = create_config(vec![
            ("label1", vec!["path/to/foo"]),
            ("label2", vec!["path/to/bar"]),
            ("label3", vec!["path/to"]),
        ]);
        let changes = create_changes(vec!["path/to/foo/file1", "path/to/bar/file2"]);
        let filtered_labels = filter_labels(config, changes).collect::<Vec<_>>();
        assert_eq!(filtered_labels, vec!["label1", "label2", "label3"]);

        // Scenario 3: No labels match
        let config = create_config(vec![
            ("label1", vec!["path/to/foo"]),
            ("label2", vec!["path/to/bar"]),
        ]);
        let changes = create_changes(vec!["path/none/match"]);
        let filtered_labels = filter_labels(config, changes).collect::<Vec<_>>();
        assert!(filtered_labels.is_empty());
    }

    fn create_config(label_data: Vec<(&str, Vec<&str>)>) -> Config {
        Config {
            labels: label_data
                .into_iter()
                .map(|(name, paths)| Label {
                    name: name.to_string(),
                    paths: paths.into_iter().map(PathBuf::from).collect(),
                })
                .collect(),
        }
    }

    fn create_changes(change_paths: Vec<&str>) -> Changes {
        Changes {
            changes: change_paths
                .into_iter()
                .map(|path| Change {
                    new_path: path.to_string(),
                })
                .collect(),
        }
    }
}
