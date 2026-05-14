pub fn exporter_name() -> &'static str {
    "alpha_exporters"
}

#[cfg(test)]
mod tests {
    use super::exporter_name;

    #[test]
    fn exports_public_symbol() {
        assert_eq!(exporter_name(), "alpha_exporters");
    }
}
