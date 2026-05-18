# Contributing

## Commit Convention

This repo follows [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Every commit message must use this structure:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Purpose                                          | SemVer |
|------------|--------------------------------------------------|--------|
| `feat`     | New feature                                      | MINOR  |
| `fix`      | Bug fix                                          | PATCH  |
| `docs`     | Documentation only                               | —      |
| `style`    | Formatting, missing semicolons, etc. (no logic)  | —      |
| `refactor` | Code change that neither fixes a bug nor adds a feature | — |
| `perf`     | Performance improvement                          | —      |
| `test`     | Adding or correcting tests                       | —      |
| `build`    | Build system or external dependencies            | —      |
| `ci`       | CI config and scripts                            | —      |
| `chore`    | Maintenance tasks that don't touch src or tests  | —      |
| `revert`   | Revert a previous commit                         | —      |

### Scope

A scope is optional and appears in parentheses after the type. Use a lowercase noun that names the affected area:

```
feat(skills): add workflow for skill validation
fix(scripts): handle missing .skills.env gracefully
```

### Breaking Changes

Indicate breaking changes in one of two ways:

1. Append `!` before the colon:

```
feat!: drop support for Node 16
feat(api)!: send email on product shipment
```

2. Add a `BREAKING CHANGE` footer:

```
feat: allow config to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

Either method correlates to a MAJOR SemVer bump.

### Footers

Use git-trailer-style footers one blank line after the body:

```
fix: prevent request races

Introduce a request id and dismiss stale responses.

Refs: #123
Reviewed-by: Z
```

### Rules

- Description must be lowercase, imperative, and under 72 characters.
- Body is free-form, separated by one blank line from the description.
- Footers come one blank line after the body.
- `BREAKING CHANGE` must be uppercase.
- Do not end the description with a period.
- Use the imperative mood: "add" not "added" or "adds".

### Examples

```
docs: correct spelling of CHANGELOG
```

```
feat(lang): add Polish language
```

```
feat!: send email when product ships

BREAKING CHANGE: drops support for Node 6
```

```
fix: prevent request races

Introduce a request id and dismiss stale responses.

Refs: #123
```

```
revert: remove noodle incident

Refs: 676104e, a215868
```
