"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CardArt from "../cards/CardArt";
import type { HistoryDay } from "../../lib/missionLog";
import type { MissionPick } from "../../lib/missions";
import type { CollectionCard } from "../../lib/play";
import { REFRESH_HEADER } from "../../lib/refresh";
import { askExtension, parseMissionsLoad } from "../../lib/extension";
import { missionsLoadNote } from "../../lib/missions";
import { cardCopyLabel, manualMissionPick } from "../../lib/missionPresentation";

const shortDay = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
function Editor({ day, rarity, collection, saved, onDirty, guard }: { day: HistoryDay; rarity: string; collection: CollectionCard[]; saved: () => void; onDirty: (dirty: boolean) => void; guard: (action: () => void) => void }) {
  const source = day.source!;
  const [picks, setPicks] = useState<MissionPick[]>(source.override?.picks ?? source.yours);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState(source.override?.note ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(source.editRevision ?? source.override?.revision ?? 0);
  const dirty = JSON.stringify(picks) !== JSON.stringify(source.override?.picks ?? source.yours) || note !== (source.override?.note ?? "");
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const pasted = manualMissionPick(manual, rarity);
  const options = new Map<string, { player: string; card?: string; game: string | null; name: string; pic: string; reported?: boolean }>();
  for (const c of day.candidates ?? []) options.set(c.card ?? c.s, { player: c.s, card: c.card, game: c.g, name: c.n, pic: c.pic });
  for (const p of source.yours) {
    const known = day.yours.find((x) => x.slug === p.player) ?? options.get(p.card ?? p.player) ?? collection.find((c) => p.card ? c.slug === p.card : c.player === p.player);
    options.set(p.card ?? p.player, { player: p.player, card: p.card, game: p.game, name: known?.name ?? p.player.replaceAll("-", " "), pic: known?.pic ?? "" });
  }
  for (const c of collection.filter((c) => c.rarity === rarity)) if (!options.has(c.slug)) options.set(c.slug, { player: c.player, card: c.slug, game: day.candidates?.find((p) => p.s === c.player)?.g ?? null, name: c.name, pic: c.pic, reported: true });
  const add = (p: { player: string; card?: string; game: string | null }) => {
    if (picks.length >= source.picks || picks.some((x) => (x.card ?? x.player) === (p.card ?? p.player))) return;
    setPicks([...picks, { player: p.player, card: p.card, game: p.game, rarity, status: null }]); setPreview(false);
  };
  const save = async (restore = false) => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/missions/history", { method: "POST", headers: { "Content-Type": "application/json", [REFRESH_HEADER]: "1" },
        body: JSON.stringify({ day: day.day, rarity, mission: day.key ?? source.key, revision, picks, note, restore }) });
      const result = await response.json() as { ok?: boolean; error?: string; data?: { revision: number } };
      if (!response.ok || !result.ok) { setMessage(result.error ?? "Could not save. Retry."); return; }
      onDirty(false);
      setRevision(result.data!.revision); setMessage(restore ? "Imported picks restored." : "Correction saved."); saved();
    } catch { setMessage("Could not save. Check your connection and retry."); } finally { setBusy(false); }
  };
  return <fieldset className="ms-editor" aria-label={`Edit picks for ${day.mission}`}>
    <legend>{shortDay(day.day)} · {day.mission} · {rarity}</legend>
    <p>Changes only your Sofix history. Make actual selections on Sorare. Added cards are user-reported unless ownership was captured that day.</p>
    <p>{source.rule.label} · up to {source.picks} picks</p>
    {dirty ? <p className="ms-draft">Unsaved correction · Preview and save when ready.</p> : null}
    <ul className="ms-edit-picks">{picks.map((p, i) => { const card = options.get(p.card ?? p.player); return <li key={p.card ?? `${p.player}:${i}`}><span className="art" aria-hidden="true"><CardArt src={card?.pic ?? ""} name={card?.name ?? p.player} /></span><span className="ms-edit-name"><b>{card?.name ?? p.player.replaceAll("-", " ")}</b><span>{cardCopyLabel(p.card)}</span></span><button type="button" onClick={() => { setPicks(picks.filter((_, n) => n !== i)); setPreview(false); }}>Remove {card?.name ?? p.player.replaceAll("-", " ")}</button></li>; })}</ul>
    <button type="button" onClick={() => { setPicks([]); setPreview(false); }}>I made no picks</button>
    <label>Search historical or current cards<input type="search" name="historical-cards" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <ul className="ms-edit-options">{[...options.values()].filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map((p) => <li key={p.card ?? p.player}>
      <button type="button" disabled={picks.length >= source.picks || picks.some((x) => (x.card ?? x.player) === (p.card ?? p.player))} onClick={() => add(p)}><span className="art" aria-hidden="true"><CardArt src={p.pic} name={p.name} /></span><span className="ms-edit-name"><b>{p.name}</b><span>{cardCopyLabel(p.card)}</span><span>{p.reported ? "Current collection · user-reported for this date" : "Recorded for this date"}</span></span></button>
    </li>)}</ul>
    <label>Missing or sold card? Paste its Sorare link<input type="url" name="manual-card-url" autoComplete="off" spellCheck={false} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://sorare.com/football/cards/…" /></label>
    {manual && !pasted ? <p role="status">Use a Sorare card link of this rarity or a Sorare player link.</p> : null}
    <button type="button" disabled={!pasted || picks.length >= source.picks} onClick={() => { if (pasted) add(pasted); setManual(""); }}>Add from Sorare link</button>
    <details><summary>Advanced: add a player reference</summary><label>Player reference<input name="manual-player" autoComplete="off" spellCheck={false} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. jan-oblak…" maxLength={120} /></label><button type="button" disabled={!/^[a-z0-9-]+$/.test(slug) || picks.length >= source.picks} onClick={() => { add({ player: slug, game: null }); setSlug(""); }}>Add user-reported player</button></details>
    <label>Note (optional)<textarea name="mission-note" maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setPreview(false); }} /></label>
    {preview ? <><p className="ms-preview">Preview: {picks.length ? picks.map((p) => options.get(p.card ?? p.player)?.name ?? p.player).join(", ") : "no picks"}</p><button type="button" disabled={busy} onClick={() => void save()}>Save correction</button></> : <button type="button" onClick={() => setPreview(true)}>Preview changes</button>}
    {source.override ? <button type="button" disabled={busy} onClick={() => guard(() => void save(true))}>Restore imported picks</button> : null}
    <p role="status">{message}</p>
  </fieldset>;
}

export default function MissionHistory({ days, rarity, collection = [], title = "History" }: { days: HistoryDay[]; rarity: string; collection?: CollectionCard[]; title?: string }) {
  const [date, setDate] = useState(""); const [editing, setEditing] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false), [recovery, setRecovery] = useState("");
  const dirty = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const onDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const guard = useCallback((action: () => void) => { if (dirty.current) setPending(() => action); else action(); }, []);
  useEffect(() => {
    if (pending) dialog.current?.showModal(); else dialog.current?.close();
  }, [pending]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!dirty.current || !link || link.target === "_blank" || link.hasAttribute("download") || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.href.split("#")[0] === location.href.split("#")[0]) return;
      event.preventDefault(); event.stopPropagation(); guard(() => location.assign(link.href));
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [guard]);
  const dates = [...new Set(days.map((d) => d.day))];
  return <section className="pd-card" aria-labelledby={`ms-history-${rarity}`}>
    <dialog ref={dialog} className="ms-discard" role="alertdialog" aria-labelledby={`ms-discard-${rarity}`} onCancel={(e) => { e.preventDefault(); setPending(null); }}><h3 id={`ms-discard-${rarity}`}>Unsaved correction</h3><p>Your changes have not been saved. Keep editing or discard them to continue.</p><div><button className="ms-load-btn" type="button" onClick={() => setPending(null)}>Keep editing</button><button className="ms-secondary" type="button" onClick={() => { dirty.current = false; const action = pending; setPending(null); action?.(); }}>Discard changes</button></div></dialog>
    <div className="ms-section-head"><h2 id={`ms-history-${rarity}`}>{title}</h2><label>Mission date<select name="history-date" value={date} onChange={(e) => { const next = e.target.value; guard(() => { setDate(next); setEditing(null); }); }}><option value="">Last 30 days</option>{dates.map((d) => <option key={d} value={d}>{shortDay(d)}</option>)}</select></label></div>
    <button className="ms-secondary" type="button" disabled={recovering} onClick={() => guard(() => { setRecovering(true); void askExtension({ type: "load-mission-history" }, 60_000).then((raw) => { const answer = parseMissionsLoad(raw); setRecovery(answer?.state === "ok" ? "Dated history imports saved. Undated or unavailable tasks remain unknown." : missionsLoadNote(answer)); if (answer?.state === "ok") window.location.reload(); }).finally(() => setRecovering(false)); })}>{recovering ? "Reconciling…" : "Reconcile Sorare history"}</button>
    <p role="status">{recovery}</p>
    {days.length ? <ol className="au-ms-days">{days.filter((d) => !date || d.day === date).map((d) => {
      const id = `${d.day}:${d.key ?? d.mission}`;
      return <li key={id} className={d.score?.best && d.score.got >= d.score.best ? "ok" : "short"}>
        <div className="au-ms-head"><b>{shortDay(d.day)}</b><span>{d.mission}{!d.loaded ? " · Assumed Decisive Picker — missions not loaded" : ""}{d.corrected ? " · Corrected by you" : ""}</span><strong>{d.score ? `Sofix ${d.score.got} of ${d.score.best}` : d.evidence === "pending" ? "Results pending" : d.evidence === "confirmed-empty" ? "Confirmed empty" : d.evidence === "unrated" ? "Target not rated" : "Forecast not recorded"}</strong></div>
        {([ ["Sofix", d.sofix], ["You", d.yours], ["Missed", d.missed] ] as const).map(([label, cards]) => <div className="ms-hist-row" key={label}><span>{label}</span>{cards.length ? <ul className="au-ms-cards" aria-label={label === "You" ? "Your picks" : label === "Sofix" ? "Sofix's picks" : "Missed achievers"}>{cards.map((c, i) => <li key={`${c.slug}:${i}`} className={`au-ms-card ${c.state === "did" ? "hit" : c.state === "waiting" ? "wait" : "miss"}`}>
          <span className="art" aria-hidden="true"><CardArt src={c.pic} name={c.name} /></span><span className="nm">{c.name}</span><span className="visually-hidden">, {label === "Missed" ? "did it, not picked" : c.state === "did" ? "did it" : c.state === "didnt" ? "did not" : c.state === "void" ? "game not played" : "waiting for his game"}</span>
        </li>)}</ul> : <p className="pd-none">{label === "Sofix" ? d.reason ?? "No recommendation recorded." : label === "You" ? d.corrected ? "You recorded no picks." : d.yourPicks === "confirmed-empty" ? "Sorare confirmed no picks at the last import." : "Your picks were not imported or confirmed." : "None recorded."}</p>}</div>)}
        {d.source?.override?.note ? <p>{d.source.override.note}</p> : null}
        {d.corrected && d.source ? <details><summary>Imported picks (original)</summary><p>{d.source.yours.length ? d.source.yours.map((p) => `${p.player.replaceAll("-", " ")} · ${p.status ?? "pending"}`).join(", ") : "No imported picks."}</p></details> : null}
        {d.source?.override?.sourcePicks && JSON.stringify(d.source.override.sourcePicks.map((p) => [p.player, p.card, p.game])) !== JSON.stringify(d.source.yours.map((p) => [p.player, p.card, p.game])) ? <p role="alert">Sorare&rsquo;s imported selections changed after your correction. Your correction is kept; review it or restore the import.</p> : null}
        {d.source ? <button className="ms-secondary" type="button" onClick={() => guard(() => setEditing(editing === id ? null : id))}>{editing === id ? "Close editor" : "Edit my picks"}</button> : null}
        {editing === id && d.source ? <Editor key={`${id}:${d.source.editRevision}`} day={d} rarity={rarity} collection={collection} onDirty={onDirty} guard={guard} saved={() => window.location.reload()} /> : null}
      </li>;
    })}</ol> : <p className="pd-none">No mission record yet.</p>}
    <p className="pd-foot">Imported Sorare verdicts take precedence over later calculated results. Missing pre-kickoff forecasts stay out of accuracy figures. <Link href="/audit/missions">How often Sofix was right</Link></p>
  </section>;
}
