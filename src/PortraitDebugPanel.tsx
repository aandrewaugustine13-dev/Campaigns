import { useMemo, useState } from "react";
import AnimatedPortrait from "./AnimatedPortrait";
import {
  PORTRAIT_ROLE_CONFIG,
  type PortraitRoleId,
  type PortraitState,
} from "./portraitSystem";

const STATES: PortraitState[] = ["happy", "tired", "injured", "critical"];

export default function PortraitDebugPanel() {
  const [selectedRole, setSelectedRole] = useState<PortraitRoleId>("boss");
  const [selectedState, setSelectedState] = useState<PortraitState>("happy");
  const [damageTrigger, setDamageTrigger] = useState(0);
  const [blinkTrigger, setBlinkTrigger] = useState(0);

  const roleIds = useMemo(() => Object.keys(PORTRAIT_ROLE_CONFIG) as PortraitRoleId[], []);

  return (
    <details className="max-w-lg mx-auto mt-2 bg-stone-800 border border-stone-700 rounded p-2" open>
      <summary className="cursor-pointer text-xs text-amber-300 font-bold">Portrait Debug Panel</summary>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">
        {roleIds.map((roleId) => (
          <div key={roleId} className="bg-stone-900 border border-stone-700 p-1 text-center">
            <div className="w-12 h-12 mx-auto border border-stone-700">
              <AnimatedPortrait roleId={roleId} state={selectedState} damageTrigger={damageTrigger} />
            </div>
            <div className="text-[9px] mt-1 text-stone-300">{PORTRAIT_ROLE_CONFIG[roleId].name}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
        <label className="text-stone-300">
          Role
          <select
            className="w-full bg-stone-900 border border-stone-600 rounded px-1 py-1"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as PortraitRoleId)}
          >
            {roleIds.map((roleId) => (
              <option key={roleId} value={roleId}>
                {PORTRAIT_ROLE_CONFIG[roleId].name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-stone-300">
          State
          <select
            className="w-full bg-stone-900 border border-stone-600 rounded px-1 py-1"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as PortraitState)}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <button
          className="px-2 py-1 bg-red-900 hover:bg-red-800 rounded"
          onClick={() => setDamageTrigger((n) => n + 1)}
        >
          Trigger Damage
        </button>
        <button
          className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded"
          onClick={() => setBlinkTrigger((n) => n + 1)}
        >
          Force Blink
        </button>
        <div className="ml-auto w-12 h-12 border border-stone-700">
          <AnimatedPortrait
            roleId={selectedRole}
            state={selectedState}
            damageTrigger={damageTrigger}
            blinkTrigger={blinkTrigger}
          />
        </div>
      </div>
    </details>
  );
}
