"""Which Sorare fields and arguments that Sofix asks for are deprecated in Sorare's published schema.

    python scripts/sorare_deprecated.py            # reads https://api.sorare.com/graphql/schema (public, no key)
    python scripts/sorare_deprecated.py -v         # also lists the strings it could not read as a query
    python scripts/sorare_deprecated.py --schema saved.graphql

Reads every GraphQL text in backend/app and extension, follows each selection through the schema's types and prints
`file:line  Type.field  (reason)`; a name the schema no longer has on that type is printed as "not in the schema".
Exits 1 when it finds either. Standard library only; not part of scripts/check.mjs because it needs the network.
Run it when Sorare emails about a deprecated field, and before adding a new query.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_URL = "https://api.sorare.com/graphql/schema"
SOURCES = ("backend/app/**/*.py", "extension/*.js")
ARGS = r"\((?:[^()]|\([^()]*\))*\)"
START = re.compile(
    r"\b(query|mutation|subscription)\b\s*\w*\s*(?=[({])|\bfragment\s+\w+\s+on\s+(\w+)\s*(?=\{)|^\s*(?=\{)"
)
ROOTS = {"query": "Query", "mutation": "Mutation", "subscription": "Subscription"}

Field = tuple[str, str | None, dict[str, str]]  # (the type it returns, why it is deprecated, {deprecated argument: why})
Types = dict[str, dict[str, Field]]


def read_schema(sdl: str) -> Types:
    sdl = re.sub(r'""".*?"""', "", sdl, flags=re.S)
    types: Types = {}
    for block in re.finditer(r"^(?:extend )?(?:type|interface) (\w+)[^{\n]*\{(.*?)^\}", sdl, re.S | re.M):
        fields = types.setdefault(block.group(1), {})
        for f in re.finditer(rf"^  (\w+)\s*({ARGS})?\s*:\s*\[*(\w+)([^\n]*)", block.group(2), re.M):
            reason = re.search(r'@deprecated(?:\(reason: "([^"]*)"\))?', f.group(4))
            old_args = dict(re.findall(r'(\w+): [^\n@]*@deprecated\(reason: "([^"]*)"\)', f.group(2) or ""))
            fields[f.group(1)] = (f.group(3), (reason.group(1) or "deprecated") if reason else None, old_args)
    return types


def tokens(text: str) -> list[str]:
    if "{{" in text:  # a str.format template: {{ }} are braces, {name} is filled in later
        text = re.sub(r"\{\w+\}", "__x", text.replace("{{", "{").replace("}}", "}"))
    text = re.sub(r"\$\{[^}]*\}", "__x", text)  # a JavaScript ${...}; glued, so `t${i}: task` stays one alias
    text = re.sub(r"#[^\n]*", "", text)
    return re.findall(r'\.\.\.|[{}():@]|\$?\w+|"(?:[^"\\]|\\.)*"', text)


class Walk:
    """Follows one selection set through the schema, noting deprecated fields and the names it could not place."""

    def __init__(self, types: Types, toks: list[str]) -> None:
        self.types, self.t = types, toks
        self.found: list[str] = []
        self.unknown: list[str] = []  # Type.name the schema does not have ("?.name": under a type we could not follow)

    def skip_parens(self, i: int) -> tuple[int, list[str]]:
        """Past the closing parenthesis that matches the one at `i`, with the argument names used."""
        depth, names = 0, []
        while i < len(self.t):
            if self.t[i] in "({":
                depth += 1
            elif self.t[i] in ")}":
                depth -= 1
                if depth == 0:
                    return i + 1, names
            elif depth == 1 and i + 1 < len(self.t) and self.t[i + 1] == ":":
                names.append(self.t[i])
            i += 1
        return i, names

    def directives(self, i: int) -> int:
        while i < len(self.t) and self.t[i] == "@":
            i += 2
            if i < len(self.t) and self.t[i] == "(":
                i, _ = self.skip_parens(i)
        return i

    def selection(self, i: int, kind: str | None) -> int:
        """`i` is just past an opening brace; returns the index just past its closing brace."""
        t = self.t
        while i < len(t) and t[i] != "}":
            if t[i] == "...":
                if i + 2 < len(t) and t[i + 1] == "on":
                    on = t[i + 2] if t[i + 2] in self.types else None
                    i = self.directives(i + 3)
                    if i < len(t) and t[i] == "{":
                        i = self.selection(i + 1, on)
                else:
                    i += 2  # a named fragment
                continue
            name, i = t[i], i + 1
            if not re.fullmatch(r"\w+", name):
                continue  # a $placeholder or stray punctuation
            if i + 1 < len(t) and t[i] == ":":
                name, i = t[i + 1], i + 2
            used: list[str] = []
            if i < len(t) and t[i] == "(":
                i, used = self.skip_parens(i)
            i = self.directives(i)
            field = self.types.get(kind or "", {}).get(name)
            if field is None and name not in ("__typename", "__x"):
                self.unknown.append(f"{kind or '?'}.{name}")
            if field:
                if field[1]:
                    self.found.append(f"{kind}.{name}  ({field[1]})")
                self.found += [f"{kind}.{name}({a}:)  ({field[2][a]})" for a in used if a in field[2]]
            if i < len(t) and t[i] == "{":
                i = self.selection(i + 1, field[0] if field else None)
        return i + 1


def check(types: Types, text: str) -> tuple[list[str], str] | None:
    """The deprecated fields of one text and how it was read, or None when it is not GraphQL."""
    found: list[str] = []
    read = False
    for start in START.finditer(text):
        kind = start.group(2) or ROOTS.get(start.group(1), "Query")
        walk = Walk(types, tokens(text[start.end() :]))
        j = walk.skip_parens(0)[0] if walk.t[:1] == ["("] else 0
        if kind not in types or walk.t[j : j + 1] != ["{"]:
            continue
        walk.selection(j + 1, kind)
        if any(name.startswith(f"{kind}.") for name in walk.unknown):
            continue  # its first names are not that type's fields: prose or code, not GraphQL
        found += walk.found + [f"not in the schema: {name}" for name in walk.unknown if not name.startswith("?.")]
        read = True
    if read:
        return found, "query"
    # A piece of a query (it is pasted into one elsewhere): read it as each type and keep the ones where every name fits.
    if not re.search(r"\w\s*\{[^{}]*\w", text):
        return None
    fits = []
    for kind in types:
        walk = Walk(types, ["{", *tokens(text), "}"])
        walk.selection(1, kind)
        if not walk.unknown:
            fits.append((kind, walk.found))
    if not fits or len(fits) > 12:  # fits nothing, or so plain that it fits anything
        return None
    return sorted({f"{line}  [a piece, read as {kind}]" for kind, lines in fits for line in lines}), "piece"


def strings(path: Path) -> list[tuple[int, str]]:
    """`(line, text)` for every string that might hold GraphQL."""
    source = path.read_text(encoding="utf-8")
    if path.suffix == ".py":
        tree = ast.parse(source)
        fstrings = [node for node in ast.walk(tree) if isinstance(node, ast.JoinedStr)]
        inside = {id(part) for node in fstrings for part in node.values}
        return [  # an f-string is read whole, each {value} as a placeholder
            (node.lineno, "".join(str(p.value) if isinstance(p, ast.Constant) else "__x" for p in node.values))
            for node in fstrings
        ] + [
            (node.lineno, node.value)
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in inside
        ]
    # JavaScript: a query may be built from nested templates. Drop the code between them, then take each operation whole.
    source = re.sub(r"\$\{[^`{}]*\?\s*`([^`]*)`\s*:\s*\"\"\}", r" \1 ", source)  # ${test ? `field` : ""}
    source = re.sub(r"\$\{[^`{}]*`", " ", source)  # ${list.map((x) => `
    source = re.sub(r"`\)[^`{}]*\}", " ", source)  # `).join(" ")}
    found = []
    for start in re.finditer(r"\b(?:query|mutation)\s+\w+\s*(\([^)]*\))?\s*\{", source):
        depth, end = 0, start.end() - 1
        for end in range(start.end() - 1, len(source)):
            depth += (source[end] == "{") - (source[end] == "}")
            if depth == 0:
                break
        found.append((source.count("\n", 0, start.start()) + 1, source[start.start() : end + 1]))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--schema", type=Path, help="a saved copy of the schema instead of downloading it")
    parser.add_argument("-v", action="store_true", help="list the brace-holding strings that were not read")
    args = parser.parse_args()
    if args.schema:
        sdl = args.schema.read_text(encoding="utf-8")
    else:
        request = urllib.request.Request(SCHEMA_URL, headers={"User-Agent": "sofix-schema-check"})
        sdl = urllib.request.urlopen(request, timeout=60).read().decode("utf-8")  # noqa: S310 (fixed https URL)
    types = read_schema(sdl)
    counts = {"query": 0, "piece": 0}
    hits = 0
    for pattern in SOURCES:
        for path in sorted(ROOT.glob(pattern)):
            for line, text in strings(path):
                if "{" not in text:
                    continue
                result = check(types, text)
                where = f"{path.relative_to(ROOT).as_posix()}:{line}"
                if result is None:
                    if args.v and re.search(r"\w\s*\{\s*\w+[\s\w]*\}", text):
                        print(f"not read  {where}  {' '.join(text.split())[:90]}")
                    continue
                counts[result[1]] += 1
                for found in dict.fromkeys(result[0]):
                    hits += 1
                    print(f"{where}  {found}")
    print(f"{counts['query']} queries and {counts['piece']} pieces read against {len(types)} types: {hits} to fix.")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
