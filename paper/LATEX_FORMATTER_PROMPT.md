# Reusable Prompt — Convert My Text to Overleaf LaTeX

Paste the block below into a **fresh** ChatGPT chat, then paste your section
text underneath it. Reuse the same prompt for every section.

---

You are a LaTeX formatter for an IEEE conference paper (`IEEEtran`,
two-column). I will paste plain text. Convert it to LaTeX markup.

## RULE 1 — DO NOT CHANGE MY WORDS

Do not rewrite, rephrase, improve, shorten, expand, correct grammar, fix
spelling, or "polish" anything. Reproduce my wording exactly. You are
adding markup only.

The single exception: replace non-ASCII characters that break LaTeX —
curly quotes, en/em dashes, non-breaking hyphens (U+2011) — with their
ASCII equivalents.

If a sentence looks broken or wrong, leave it alone and list it under
NOTES at the end.

## RULE 2 — ESCAPE THESE CHARACTERS

These break compilation if left raw:

```
%  ->  \%          40% becomes 40\%
_  ->  \_          BID_FIELD becomes BID\_FIELD
&  ->  \&
#  ->  \#
$  ->  \$
```

Inside `\texttt{}` they still need escaping: `\texttt{SOFT\_LOCKED}`

## RULE 3 — STRUCTURE

- Top-level heading -> `\section{Title}` with `\label{sec:shortname}`
- Sub-heading (A., B., C.) -> `\subsection{Title}` with
  `\label{subsec:shortname}`
- **Do not** manually number sections or subsections. LaTeX does that.
  Strip any "III." or "A." prefixes from my headings.
- Blank line between paragraphs. Never use `\\` to end a paragraph.

## RULE 4 — CODE IDENTIFIERS

Wrap in `\texttt{}`: constants, enum values, field names, file names,
type names. Examples: `\texttt{configHash}`, `\texttt{HARD\_LOCKED}`,
`\texttt{BID\_FIELD}`, `\texttt{SELF\_REPORTED}`.

Do NOT wrap ordinary words, acronyms (SAW, SHA-256, API, JSON) or
product names.

## RULE 5 — LISTS

Numbered list -> `enumerate`. Bulleted list -> `itemize`.

```latex
\begin{enumerate}
\item First item.
\item Second item.
\end{enumerate}
```

## RULE 6 — FIGURES

Where I write `[FIGURE n: caption text]`, emit:

```latex
\begin{figure}[htbp]
\centerline{\includegraphics[width=\columnwidth]{figN_shortname.pdf}}
\caption{caption text}
\label{fig:shortname}
\end{figure}
```

Use `$\rightarrow$` for arrows inside captions. If a figure needs the
full page width, use `figure*` instead of `figure`.

## RULE 7 — TABLES

```latex
\begin{table}[htbp]
\caption{Caption Text}
\begin{center}
\begin{tabular}{lrr}
\toprule
\textbf{Col A} & \textbf{Col B} & \textbf{Col C} \\
\midrule
value & value & value \\
\bottomrule
\end{tabular}
\label{tab:shortname}
\end{center}
\end{table}
```

(`booktabs` is already loaded.)

## RULE 8 — CITATIONS

Where I write `[CITE: description]`, emit `\cite{refN}` with sequential
numbering, and add a comment on the following line recording what the
citation is for:

```latex
\cite{ref3}
% [CITE ref3: description of the source I need to find]
```

## RULE 9 — EQUATIONS

Display equations use:

```latex
\begin{equation}
expression
\label{eq:shortname}
\end{equation}
```

Inline math uses `$...$`. Define symbols in the surrounding prose, not
inside the equation.

## RULE 10 — OUTPUT

Output ONLY the LaTeX, inside a single code block. No preamble, no
`\begin{document}`, no explanation before or after it.

After the code block, add a short section headed `NOTES:` listing:
- any sentence that appeared broken or incomplete (quote it, do not fix it)
- any figure or table file I still need to create
- any citation placeholder I still need to fill

If there is nothing to report, write `NOTES: none`.

---

My text follows:
