"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/controls";
import { Field } from "@/components/ui/Field";
import { chipClasses } from "@/components/ui/Pill";
import { Severity, Side, type Equipment } from "@/lib/domain/types";
import { ScalingLevel, Sex, type Goal, type ProfileInjury, type StoredProfile } from "@/lib/engine/types";

interface Props {
  initial: StoredProfile;
  catalog: { key: string; label: string; kind: string }[];
  movementNames: string[];
  equipmentOptions: Equipment[];
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function ProfileForm({ initial, catalog, movementNames, equipmentOptions }: Props) {
  const t = useTranslations("profile");
  const [p, setP] = useState<StoredProfile>(initial);
  const [newInjury, setNewInjury] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  // Library labels are data: shown as stored, not translated.
  const conditionLabel = (key: string) => catalog.find((c) => c.key === key)?.label ?? key;
  // Only injuries scale with side and severity; limitations and conditions apply as written.
  const isInjury = (key: string) => catalog.find((c) => c.key === key)?.kind === "injury";
  const setInjury = (i: number, patch: Partial<ProfileInjury>) =>
    setP({ ...p, injuries: p.injuries.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setGoal = (i: number, patch: Partial<Goal>) =>
    setP({ ...p, goals: p.goals.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  async function save() {
    setStatus("saving");
    const body: StoredProfile = {
      ...p,
      goals: p.goals.filter((g) => g.description.trim() !== ""),
    };
    const res = await fetch("/api/profile", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      setStatus("failed");
      return;
    }
    setP((await res.json()).profile);
    setStatus("saved");
  }

  return (
    <div className="flex flex-col gap-6">
      <datalist id="movement-names">{movementNames.map((n) => <option key={n} value={n} />)}</datalist>

      <Card as="section" className="flex flex-col gap-4 p-5">
        <h2>{t("about")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sex")}>
            <Select value={p.sex ?? ""} onChange={(e) => setP({ ...p, sex: e.target.value === "" ? null : Sex.parse(e.target.value) })}>
              <option value="">{t("notSet")}</option>
              {Sex.options.map((s) => <option key={s} value={s}>{t(`sexes.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("level")}>
            <Select value={p.scalingLevel ?? ""} onChange={(e) => setP({ ...p, scalingLevel: e.target.value === "" ? null : ScalingLevel.parse(e.target.value) })}>
              <option value="">{t("notSet")}</option>
              {ScalingLevel.options.map((s) => <option key={s} value={s}>{t(`levels.${s}`)}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-3 p-5">
        <h2>{t("injuries")}</h2>
        {p.injuries.map((inj, i) => (
          <div key={inj.key} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{conditionLabel(inj.key)}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setP({ ...p, injuries: p.injuries.filter((_, j) => j !== i) })}>
                {t("remove")}
              </Button>
            </div>
            {isInjury(inj.key) ? (
              <div className="grid grid-cols-2 gap-2">
                <Select compact aria-label={t("side")} value={inj.side ?? ""} onChange={(e) => setInjury(i, { side: e.target.value === "" ? null : Side.parse(e.target.value) })}>
                  <option value="">{t("noSide")}</option>
                  {Side.options.map((s) => <option key={s} value={s}>{t(`sides.${s}`)}</option>)}
                </Select>
                <Select compact aria-label={t("severity")} value={inj.severity} onChange={(e) => setInjury(i, { severity: Severity.parse(e.target.value) })}>
                  {Severity.options.map((s) => <option key={s} value={s}>{t(`severities.${s}`)}</option>)}
                </Select>
              </div>
            ) : (
              <span className="text-sm text-muted">{t("alwaysApplies")}</span>
            )}
            <Input compact placeholder={t("notes")} aria-label={t("notes")} value={inj.notes ?? ""} onChange={(e) => setInjury(i, { notes: e.target.value || null })} />
          </div>
        ))}
        <div className="flex gap-2">
          <Select compact aria-label={t("addInjury")} className="min-w-0 grow" value={newInjury} onChange={(e) => setNewInjury(e.target.value)}>
            <option value="">{t("addInjury")}</option>
            {catalog.filter((c) => !p.injuries.some((i) => i.key === c.key)).map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </Select>
          <Button type="button" variant="secondary" size="sm" disabled={!newInjury} onClick={() => {
            setP({ ...p, injuries: [...p.injuries, { key: newInjury, side: null, severity: "moderate", notes: null, since: null }] });
            setNewInjury("");
          }}>{t("add")}</Button>
        </div>
      </Card>

      <Card as="section" className="flex flex-col gap-3 p-5">
        <h2>{t("equipment")}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.equipment === null} onChange={(e) => setP({ ...p, equipment: e.target.checked ? null : [] })} />
          {t("fullBox")}
        </label>
        {p.equipment !== null && (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => (
              <button key={e} type="button" className={chipClasses(p.equipment!.includes(e))} aria-pressed={p.equipment!.includes(e)}
                onClick={() => setP({ ...p, equipment: toggle(p.equipment!, e) })}>{t(`equipmentItems.${e}`)}</button>
            ))}
          </div>
        )}
      </Card>

      <Card as="section" className="flex flex-col gap-3 p-5">
        <h2>{t("goals")}</h2>
        {p.goals.map((g, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <Input compact placeholder={t("goalPlaceholder")} aria-label={t("goalPlaceholder")} value={g.description} onChange={(e) => setGoal(i, { description: e.target.value })} />
            <Input compact list="movement-names" placeholder={t("goalMovement")} aria-label={t("goalMovement")} value={g.movement ?? ""} onChange={(e) => setGoal(i, { movement: e.target.value || null })} />
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setP({ ...p, goals: p.goals.filter((_, j) => j !== i) })}>{t("remove")}</Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setP({ ...p, goals: [...p.goals, { movement: null, description: "" }] })}>{t("addGoal")}</Button>
      </Card>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="primary" block slanted disabled={status === "saving"} onClick={save}>{t("save")}</Button>
        {status === "saved" && <p role="status" className="text-center text-sm text-success">{t("saved")}</p>}
        {status === "failed" && <p role="alert" className="text-center text-sm text-danger">{t("saveFailed")}</p>}
      </div>
    </div>
  );
}
