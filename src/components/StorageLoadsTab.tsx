import type { Battery, ElectricVehicleProfile, HeatPumpProfile, LoadProfile } from '../model/schema';
import { useProjectStore } from '../store/projectStore';

type BatteryNumberField = Extract<keyof Battery, 'capacityKwh' | 'pChargeMaxKw' | 'pDischargeMaxKw' | 'roundTripEfficiency' | 'socMin' | 'socMax' | 'standbyW'>;
type LoadNumberField = Extract<keyof LoadProfile, 'annualKwh'>;
type HeatPumpNumberField = Extract<keyof HeatPumpProfile, 'winterDayKwh' | 'heatingBaseTempC'>;
type EVNumberField = Extract<keyof ElectricVehicleProfile, 'batteryCapacityKwh' | 'chargePowerKw' | 'weekdayUseKwh' | 'weekendUseKwh' | 'chargeStartHour' | 'chargeEndHour'>;
function numberValue(rawValue: string): number | null {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

export function StorageLoadsTab() {
  const project = useProjectStore((s) => s.project);
  const addBattery = useProjectStore((s) => s.addBattery);
  const updateBattery = useProjectStore((s) => s.updateBattery);
  const removeBattery = useProjectStore((s) => s.removeBattery);
  const addLoadProfile = useProjectStore((s) => s.addLoadProfile);
  const updateLoadProfile = useProjectStore((s) => s.updateLoadProfile);
  const removeLoadProfile = useProjectStore((s) => s.removeLoadProfile);
  const addHeatPump = useProjectStore((s) => s.addHeatPump);
  const updateHeatPump = useProjectStore((s) => s.updateHeatPump);
  const removeHeatPump = useProjectStore((s) => s.removeHeatPump);
  const addElectricVehicle = useProjectStore((s) => s.addElectricVehicle);
  const updateElectricVehicle = useProjectStore((s) => s.updateElectricVehicle);
  const removeElectricVehicle = useProjectStore((s) => s.removeElectricVehicle);

  const battery = project.storage.batteries[0] ?? null;
  const load = project.loads.base[0] ?? null;
  const heatPump = project.loads.heatPumps[0] ?? null;
  const ev = project.loads.electricVehicles[0] ?? null;

  const updateBatteryNumber = (field: BatteryNumberField, rawValue: string) => {
    if (!battery) return;
    const value = numberValue(rawValue);
    if (value !== null) updateBattery(battery.id, { [field]: value });
  };
  const updateLoadNumber = (field: LoadNumberField, rawValue: string) => {
    if (!load) return;
    const value = numberValue(rawValue);
    if (value !== null) updateLoadProfile(load.id, { [field]: value });
  };
  const updateHeatPumpNumber = (field: HeatPumpNumberField, rawValue: string) => {
    if (!heatPump) return;
    const value = numberValue(rawValue);
    if (value !== null) updateHeatPump(heatPump.id, { [field]: value });
  };
  const updateEVNumber = (field: EVNumberField, rawValue: string) => {
    if (!ev) return;
    const value = numberValue(rawValue);
    if (value !== null) updateElectricVehicle(ev.id, { [field]: value });
  };
  return (
    <div className="panel-content storage-loads-tab">
      <section className="simulation-controls">
        <h2>Accu & Verbruik</h2>
        <p className="hint">
          Configureer fase-4 input voor V4 economische optimalisatie: huishouden, warmtepomp, EV en accu.
        </p>
      </section>

      <section className="simulation-summary">
        <header className="sub-editor-header">
          <h3>Accu</h3>
          {battery ? (
            <button type="button" onClick={() => removeBattery(battery.id)}>Verwijderen</button>
          ) : (
            <button type="button" onClick={() => addBattery({ capacityKwh: 64, pChargeMaxKw: 10, pDischargeMaxKw: 10, roundTripEfficiency: 0.95 })}>64 kWh accu toevoegen</button>
          )}
        </header>
        {battery && (
          <div className="field-grid">
            <label>Naam<input value={battery.name} onChange={(e) => updateBattery(battery.id, { name: e.target.value })} /></label>
            <label>Capaciteit (kWh)<input type="number" min={0.1} value={battery.capacityKwh} onChange={(e) => updateBatteryNumber('capacityKwh', e.target.value)} /></label>
            <label>Laadvermogen (kW)<input type="number" min={0.1} value={battery.pChargeMaxKw} onChange={(e) => updateBatteryNumber('pChargeMaxKw', e.target.value)} /></label>
            <label>Ontlaadvermogen (kW)<input type="number" min={0.1} value={battery.pDischargeMaxKw} onChange={(e) => updateBatteryNumber('pDischargeMaxKw', e.target.value)} /></label>
            <label>Rondrendement<input type="number" min={0.01} max={1} step={0.01} value={battery.roundTripEfficiency} onChange={(e) => updateBatteryNumber('roundTripEfficiency', e.target.value)} /></label>
            <label>Standby (W)<input type="number" min={0} value={battery.standbyW} onChange={(e) => updateBatteryNumber('standbyW', e.target.value)} /></label>
            <label><input type="checkbox" checked={battery.allowGridCharge} onChange={(e) => updateBattery(battery.id, { allowGridCharge: e.target.checked })} /> Grid pre-charge toestaan</label>
            <label><input type="checkbox" checked={battery.allowGridExport} onChange={(e) => updateBattery(battery.id, { allowGridExport: e.target.checked })} /> Accu-export toestaan</label>
          </div>
        )}
      </section>

      <section className="simulation-summary">
        <header className="sub-editor-header">
          <h3>Basisverbruik</h3>
          {load ? <button type="button" onClick={() => removeLoadProfile(load.id)}>Verwijderen</button> : <button type="button" onClick={() => addLoadProfile()}>Toevoegen</button>}
        </header>
        {load && (
          <div className="field-grid">
            <label>Naam<input value={load.name} onChange={(e) => updateLoadProfile(load.id, { name: e.target.value })} /></label>
            <label>Jaarverbruik (kWh)<input type="number" min={0} value={load.annualKwh} onChange={(e) => updateLoadNumber('annualKwh', e.target.value)} /></label>
            <label>Profiel<select value={load.shape} onChange={(e) => updateLoadProfile(load.id, { shape: e.target.value as LoadProfile['shape'] })}><option value="flat">vlak</option><option value="morning_peak">ochtendpiek</option><option value="evening_peak">avondpiek</option><option value="work_from_home">thuiswerken</option></select></label>
          </div>
        )}
      </section>

      <section className="simulation-summary">
        <header className="sub-editor-header">
          <h3>Warmtepomp</h3>
          {heatPump ? <button type="button" onClick={() => removeHeatPump(heatPump.id)}>Verwijderen</button> : <button type="button" onClick={() => addHeatPump()}>Toevoegen</button>}
        </header>
        {heatPump && (
          <div className="field-grid">
            <label>Naam<input value={heatPump.name} onChange={(e) => updateHeatPump(heatPump.id, { name: e.target.value })} /></label>
            <label>Winterdag (kWh)<input type="number" min={0} value={heatPump.winterDayKwh} onChange={(e) => updateHeatPumpNumber('winterDayKwh', e.target.value)} /></label>
            <label>Stookgrens (°C)<input type="number" value={heatPump.heatingBaseTempC} onChange={(e) => updateHeatPumpNumber('heatingBaseTempC', e.target.value)} /></label>
          </div>
        )}
      </section>

      <section className="simulation-summary">
        <header className="sub-editor-header">
          <h3>Elektrische auto</h3>
          {ev ? <button type="button" onClick={() => removeElectricVehicle(ev.id)}>Verwijderen</button> : <button type="button" onClick={() => addElectricVehicle()}>Typische EV toevoegen</button>}
        </header>
        <p className="hint">Default: 60 kWh batterij, 11 kW laden en circa 6 kWh per weekdag op basis van typische NL/Europese EV-usage.</p>
        {ev && (
          <div className="field-grid">
            <label>Naam<input value={ev.name} onChange={(e) => updateElectricVehicle(ev.id, { name: e.target.value })} /></label>
            <label>EV batterij (kWh)<input type="number" min={0.1} value={ev.batteryCapacityKwh} onChange={(e) => updateEVNumber('batteryCapacityKwh', e.target.value)} /></label>
            <label>Laadvermogen (kW)<input type="number" min={0.1} value={ev.chargePowerKw} onChange={(e) => updateEVNumber('chargePowerKw', e.target.value)} /></label>
            <label>Weekdag verbruik (kWh)<input type="number" min={0} value={ev.weekdayUseKwh} onChange={(e) => updateEVNumber('weekdayUseKwh', e.target.value)} /></label>
            <label>Weekend verbruik (kWh)<input type="number" min={0} value={ev.weekendUseKwh} onChange={(e) => updateEVNumber('weekendUseKwh', e.target.value)} /></label>
            <label>Startuur<input type="number" min={0} max={23} value={ev.chargeStartHour} onChange={(e) => updateEVNumber('chargeStartHour', e.target.value)} /></label>
            <label>Einduur<input type="number" min={0} max={23} value={ev.chargeEndHour} onChange={(e) => updateEVNumber('chargeEndHour', e.target.value)} /></label>
            <label><input type="checkbox" checked={ev.flexible} onChange={(e) => updateElectricVehicle(ev.id, { flexible: e.target.checked })} /> Flexibel laden binnen venster</label>
          </div>
        )}
      </section>
    </div>
  );
}
