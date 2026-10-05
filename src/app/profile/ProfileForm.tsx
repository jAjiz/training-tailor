"use client";

import { useState } from "react";
import { Severity, Side, type Equipment } from "@/lib/domain/types";
import {
  BenchmarkKind, BenchmarkUnit, ScalingLevel, Sex, Weekday,
  type AthleteProfile, type Benchmark, type Goal, type ProfileInjury,
} from "@/lib/engine/types";

interface Props {
  initial: AthleteProfile;
  catalog: { key: string; label: string; kind: string }[];
  movementNames: string[];
  equipmentOptions: Equipment[];
}

const field = "rounded border px-2 py-1 text-sm";
const chip = (on: boolean) => `rounded border px-3 py-1 text-sm ${on ? "bg-black text-white" : ""}`;
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const intOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
const label = (s: string) => s.replaceAll("_", " ");

export function ProfileForm({ initial, catalog, movementNames, equipmentOptions }: Props) {
  const [p, setP] = useState<AthleteProfile>(initial);
  const [newInjury, setNewInjury] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const conditionLabel = (key: string) => catalog.find((c) => c.key === key)?.label ?? key;
  const setInjury = (i: number, patch: Partial<ProfileInjury>) =>
    setP({ ...p, injuries: p.injuries.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setBenchmark = (i: number, patch: Partial<Benchmark>) =>
    setP({ ...p, benchmarks: p.benchmarks.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setGoal = (i: number, patch: Partial<Goal>) =>
    setP({ ...p, goals: p.goals.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function save() {
    setStatus("Saving…");
    const body: AthleteProfile = {
      ...p,
      benchmarks: p.benchmarks.filter((b) => b.movement.trim() !== "" && b.value > 0),
      goals: p.goals.filter((g) => g.description.trim() !== ""),
    };
    const res = await fetch("/api/profile", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      setStatus("Could not save. Check the values and try again.");
      return;
    }
    setP((await res.json()).profile);
    setStatus("Saved");
  }

  return (
    <div className="flex flex-col gap-8">
      <datalist id="movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">About you</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">Loads
            <select className={field} value={p.sex ?? ""} onChange={(e) => setP({ ...p, sex: e.target.value === "" ? null : Sex.parse(e.target.value) })}>
              <option value="">not set</option>
              {Sex.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">Level
            <select className={field} value={p.scalingLevel ?? ""} onChange={(e) => setP({ ...p, scalingLevel: e.target.value === "" ? null : ScalingLevel.parse(e.target.value) })}>
              <option value="">not set</option>
              {ScalingLevel.options.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Injuries and limitations</h2>
        {p.injuries.map((inj, i) => (
          <div key={inj.key} className="flex flex-wrap items-center gap-2 rounded border p-2">
            <span className="font-medium">{conditionLabel(inj.key)}</span>
            <select className={field} value={inj.side ?? ""} onChange={(e) => setInjury(i, { side: e.target.value === "" ? null : Side.parse(e.target.value) })}>
              <option value="">no side</option>
              {Side.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={field} value={inj.severity} onChange={(e) => setInjury(i, { severity: Severity.parse(e.target.value) })}>
              {Severity.options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={`${field} grow`} placeholder="notes" value={inj.notes ?? ""} onChange={(e) => setInjury(i, { notes: e.target.value || null })} />
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, injuries: p.injuries.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <select className={field} value={newInjury} onChange={(e) => setNewInjury(e.target.value)}>
            <option value="">add an injury or limitation…</option>
            {catalog.filter((c) => !p.injuries.some((i) => i.key === c.key)).map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button type="button" className={chip(false)} disabled={!newInjury} onClick={() => {
            setP({ ...p, injuries: [...p.injuries, { key: newInjury, side: null, severity: "moderate", notes: null, since: null }] });
            setNewInjury("");
          }}>Add</button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Equipment</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.equipment === null} onChange={(e) => setP({ ...p, equipment: e.target.checked ? null : [] })} />
          I train in a fully equipped box
        </label>
        {p.equipment !== null && (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => (
              <button key={e} type="button" className={chip(p.equipment!.includes(e))}
                onClick={() => setP({ ...p, equipment: toggle(p.equipment!, e) })}>{label(e)}</button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Benchmarks</h2>
        {p.benchmarks.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={field} list="movement-names" placeholder="movement" value={b.movement} onChange={(e) => setBenchmark(i, { movement: e.target.value })} />
            <select className={field} value={b.kind} onChange={(e) => setBenchmark(i, { kind: BenchmarkKind.parse(e.target.value) })}>
              {BenchmarkKind.options.map((k) => <option key={k} value={k}>{label(k)}</option>)}
            </select>
            <input className={`${field} w-24`} type="number" min={0} step="any" value={b.value || ""} onChange={(e) => setBenchmark(i, { value: Number(e.target.value) })} />
            <select className={field} value={b.unit} onChange={(e) => setBenchmark(i, { unit: BenchmarkUnit.parse(e.target.value) })}>
              {BenchmarkUnit.options.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, benchmarks: p.benchmarks.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <button type="button" className={`${chip(false)} w-fit`} onClick={() => setP({
          ...p, benchmarks: [...p.benchmarks, { movement: "", kind: "1rm", value: 0, unit: "kg", recordedAt: null }],
        })}>Add benchmark</button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Goals</h2>
        {p.goals.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className={`${field} grow`} placeholder="e.g. first strict muscle-up" value={g.description} onChange={(e) => setGoal(i, { description: e.target.value })} />
            <input className={field} list="movement-names" placeholder="movement (optional)" value={g.movement ?? ""} onChange={(e) => setGoal(i, { movement: e.target.value || null })} />
            <button type="button" className="text-sm underline" onClick={() => setP({ ...p, goals: p.goals.filter((_, j) => j !== i) })}>remove</button>
          </div>
        ))}
        <button type="button" className={`${chip(false)} w-fit`} onClick={() => setP({ ...p, goals: [...p.goals, { movement: null, description: "" }] })}>Add goal</button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Availability</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">Minutes per day
            <input className={`${field} w-20`} type="number" min={1} value={p.availability.minutesPerDay ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, minutesPerDay: intOrNull(e.target.value) } })} />
          </label>
          <label className="flex items-center gap-2">Days per week
            <input className={`${field} w-16`} type="number" min={1} max={7} value={p.availability.daysPerWeek ?? ""} onChange={(e) => setP({ ...p, availability: { ...p.availability, daysPerWeek: intOrNull(e.target.value) } })} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {Weekday.options.map((d) => (
            <button key={d} type="button" className={chip(p.availability.days.includes(d))}
              onClick={() => setP({ ...p, availability: { ...p.availability, days: toggle(p.availability.days, d) } })}>{d}</button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded bg-black px-4 py-2 text-white" onClick={save}>Save profile</button>
        {status && <span className="text-sm text-neutral-600">{status}</span>}
      </div>
    </div>
  );
}
