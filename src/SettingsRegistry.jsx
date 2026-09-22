import React, {useEffect, useState} from 'react';
import {CaretRight, CheckCircle, Clock, DownloadSimple, Info, LockKey, Plus} from '@phosphor-icons/react';
import {
  createCategory,
  createValue,
  createOverride,
  getCurrentOrganization,
  isApiConfigured,
  load,
  loadAudit,
  updateOverride,
  updateValue
} from './api';
const uid = prefix => prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
function Badge({children}) { return <span className="badge gray">{children}</span>; }
function Btn({children, onClick, primary = false, ...props}) { return <button className={'btn ' + (primary ? 'primary' : '')} onClick={onClick} {...props}>{children}</button>; }

export default function SettingsRegistry({settings, setSettings, settingAudit, setSettingAudit, notify, visible}) {
  const [selectedId, setSelectedId] = useState(settings[0]?.id);
  const [tab, setTab] = useState('Values');
  const [newValue, setNewValue] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [organization, setOrganization] = useState({
  id: null,
  name: '',
});

 useEffect(() => {
  if (!visible || !isApiConfigured) return;

  let cancelled = false;

  Promise.all([
  loadAudit(),
  getCurrentOrganization(),
])
  .then(async ([audit, currentOrganization]) => {
    if (cancelled) return;

    setSettingAudit(
      Array.isArray(audit) ? audit : audit?.data || []
    );

    setOrganization({
      id: currentOrganization.organizationId,
      name: currentOrganization.organizationName,
    });

    const categories = await load(
      currentOrganization.organizationId
    );

    if (cancelled) return;

    if (categories.length) {
      setSettings(categories);
      setSelectedId(categories[0].id);
    }
  })
    .catch(() => {
      if (!cancelled) {
        notify("Failed to load system settings.");
      }
    });

  return () => {
    cancelled = true;
  };
}, [visible]);
  if (!visible) return null;
  const category = settings.find(c => c.id === selectedId) || settings[0];
  const organizationId = organization.id;
  const refreshAudit = async () => { if (isApiConfigured) { try { const audit = await loadAudit(); setSettingAudit(Array.isArray(audit) ? audit : audit?.data || []); return; } catch { notify('The setting changed, but the audit log could not be refreshed.'); } } };
  const record = (action, value) => { if (!isApiConfigured) setSettingAudit(a => [{id: uid('AUD'), action, categoryId: category.id, value, time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}, ...a]); };
  const changeValue = async (valueId, patch) => {
    if (isApiConfigured) {
      try { await updateValue(valueId, patch); } catch { notify('Backend update failed. The local change was not sent.'); return; }
    }
    setSettings(settings.map(c => c.id !== category.id ? c : {...c, values: c.values.map(v => v.id === valueId ? {...v, ...patch} : patch.isDefault ? {...v, isDefault: false} : v)}));
    record(patch.isActive === false ? 'deactivate' : 'update', valueId);
    await refreshAudit();
    notify('Setting updated.');
  };
  const addValue = async e => {
    e.preventDefault();
    if (!newValue.trim()) return;
    const value = {id: uid('SET'), value: newValue.trim().toLowerCase().replace(/\s+/g, '_'), label: newValue.trim(), sortOrder: category.values.length + 1, isActive: true, isDefault: false, isSystemDefined: false};
    if (isApiConfigured) {
      try { await createValue(category.id, value); } catch { notify('Backend create failed. The local value was not added.'); return; }
    }
    setSettings(settings.map(c => c.id === category.id ? {...c, values: [...c.values, value]} : c));
    record('create', value.id);
    await refreshAudit();
    setNewValue('');
    notify('Value added.');
  };
  const addCategory = async e => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const key = newCategory.trim().toLowerCase().replace(/\s+/g, '.');
    const categoryValue = {id: uid('CAT'), module: key.split('.')[0], key, name: newCategory.trim(), description: 'Admin-defined setting category.', isSystemDefined: false, values: [], overrides: []};
    if (isApiConfigured) {
      try { const created = await createCategory(categoryValue); setSettings(await load()); setSelectedId(created.id || created.category?.id); await refreshAudit(); }
      catch { notify('Backend category creation failed. The local category was not added.'); return; }
    } else {
      setSettings([...settings, categoryValue]);
      setSelectedId(categoryValue.id);
      record('create-category', categoryValue.id);
    }
    setNewCategory('');
    notify('Category created.');
  };

  const addOverride = async (value) => {
  if (!organizationId) {
    notify("Organization information is not available.");
    return;
  }

  try {
    await createOverride({
      category_id: category.id,
      org_id: organizationId,
      value: value.value,
      label: value.label,
      sort_order: value.sortOrder,
      is_active: true,
    });

    const refreshedSettings = await load(organizationId);

    setSettings(refreshedSettings);

    notify("Organization override created.");
  } catch (error) {
    notify("Failed to create organization override.");
  }
};

  const moveValue = async (valueId, direction) => {
    const ordered = [...category.values].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex(value => value.id === valueId);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const values = ordered.map((value, position) => ({...value, sortOrder: position + 1}));
    if (isApiConfigured) {
      try { await Promise.all(values.map(value => updateValue(value.id, {sortOrder: value.sortOrder}))); }
      catch { notify('Backend reorder failed. The local order was not changed.'); return; }
    }
    setSettings(settings.map(c => c.id === category.id ? {...c, values} : c));
    record('reorder', valueId);
    await refreshAudit();
    notify('Value order updated.');
  };
  const importSettings = event => {
    if (isApiConfigured) { notify('Bulk import is not available for this workspace.'); return; }
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.categories)) throw new Error('categories missing');
        setSettings(parsed.categories);
        setSettingAudit(parsed.audit || []);
        setSelectedId(parsed.categories[0]?.id);
        notify('Settings imported locally from JSON.');
      } catch { notify('Import failed. Use a JSON export containing categories and values.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({categories: settings, audit: settingAudit}, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'settings-export.json'; link.click(); URL.revokeObjectURL(url);
    notify('Settings exported as JSON.');
  };
  return <section className="settings-registry" aria-label="System settings registry">
    <div className="settings-title-row"><div><div className="eyebrow">SYSTEM SETTINGS</div><h2>Configuration registry</h2><p className="muted">One source of truth for dropdowns, statuses and reference data across every module.</p></div><div className="settings-actions">{!isApiConfigured&&<label className="btn"><input hidden type="file" accept="application/json" onChange={importSettings}/>Import JSON</label>}<Btn onClick={exportSettings}><DownloadSimple size={17}/>Export JSON</Btn><Badge>Platform Admin</Badge></div></div>
    <div className="settings-layout"><aside className="settings-categories"><div className="settings-section-label">Categories <span>{settings.length}</span></div>{settings.map(c => <button key={c.id} className={c.id === category.id ? 'selected' : ''} onClick={() => {setSelectedId(c.id); setTab('Values');}}><span><strong>{c.name}</strong><small>{c.key}</small></span><CaretRight size={16}/></button>)}<form className="settings-category-add" onSubmit={addCategory}><input aria-label="New category name" placeholder="New category" value={newCategory} onChange={e => setNewCategory(e.target.value)}/><button aria-label="Add category" type="submit"><Plus size={16}/></button></form></aside>
      <div className="settings-main"><div className="settings-category-head"><div><div className="eyebrow">{category.module.toUpperCase()} · {category.isSystemDefined ? 'SYSTEM CATEGORY' : 'ADMIN CATEGORY'}</div><h3>{category.name}</h3><p>{category.description}</p></div><Badge>{category.values.filter(v => v.isActive).length} active</Badge></div>
      <div className="settings-tabs">{['Values', 'Org overrides', 'Audit log'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}<span>{t === 'Values' ? category.values.length : t === 'Org overrides' ? (category.overrides?.length || 0) : settingAudit.length}</span></button>)}</div>
      {tab === 'Values' && <><div className="settings-table-wrap"><table className="settings-table"><thead><tr><th>Order</th><th>Stable value</th><th>Label</th><th>State</th><th>Protection</th><th></th></tr></thead><tbody>{[...category.values].sort((a, b) => a.sortOrder - b.sortOrder).map((v, index) => <tr key={v.id}><td><span className="sort-number">{v.sortOrder}</span><button className="order-button" aria-label={'Move ' + v.label + ' up'} disabled={index === 0} onClick={() => moveValue(v.id, -1)}>↑</button><button className="order-button" aria-label={'Move ' + v.label + ' down'} disabled={index === category.values.length - 1} onClick={() => moveValue(v.id, 1)}>↓</button></td><td><code>{v.value}</code></td><td><input aria-label={'Label for ' + v.value} value={v.label} onChange={e => changeValue(v.id, {label: e.target.value})}/></td><td><button className={'status-toggle ' + (v.isActive ? 'on' : '')} onClick={() => changeValue(v.id, {isActive: !v.isActive})}>{v.isActive ? 'Active' : 'Inactive'}</button></td><td>{v.isSystemDefined ? <span className="protected"><LockKey size={14}/>System</span> : <span className="custom">Custom</span>}</td><td>{v.isDefault ? <Badge>Default</Badge> : <button className="text-btn" onClick={() => changeValue(v.id, {isDefault: true})}>Make default</button>}</td></tr>)}</tbody></table></div><form className="settings-add" onSubmit={addValue}><input aria-label="New setting value" placeholder="Add custom value label" value={newValue} onChange={e => setNewValue(e.target.value)}/><Btn primary type="submit"><Plus size={17}/>Add value</Btn></form><p className="micro"><Info size={14}/> System-defined and referenced values are never hard-deleted. Deactivate them to preserve history.</p></>}
      {tab === 'Org overrides' && <div className="settings-panel"><div className="settings-panel-heading"><div><h3>{organization.name || "Organization"} extensions</h3><p className="muted">Additive organization options. Global values remain unchanged.</p></div><Badge>{category.overrides?.length || 0} custom</Badge></div>
      <div className="settings-add">
  {category.values
    .filter(value => value.isActive)
    .map(value => (
      <Btn
        key={value.id}
        primary
        onClick={() => addOverride(value)}
      >
        <Plus size={17} />
        Add "{value.label}" override
      </Btn>
    ))}
</div>
      {category.overrides?.length ? <table className="settings-table"><thead><tr><th>Organization</th><th>Value</th><th>Label</th><th>State</th></tr></thead><tbody>{category.overrides.map(o => <tr key={o.id}><td>{o.orgId}</td><td><code>{o.value}</code></td><td>{o.label}</td><td><Badge>{o.isActive ? 'Active' : 'Inactive'}</Badge></td></tr>)}</tbody></table> : <div className="empty"><h3>No organization extensions</h3><p>Global values are available to every organization.</p></div>}</div>}
      {tab === 'Audit log' && <div className="settings-panel"><div className="settings-panel-heading"><div><h3>Recent changes</h3><p className="muted">Review who changed a setting and when.</p></div><Badge>{settingAudit.length} changes</Badge></div>{settingAudit.length ? settingAudit.map(a => <div className="settings-audit-row" key={a.id}><CheckCircle size={19}/><div><strong>{a.action}</strong><span>{a.value} · {category.key}</span></div><small>{a.time} · Ananya Rao</small></div>) : <div className="empty"><Clock size={30}/><h3>No changes yet</h3><p>Value edits, activation changes and new values will appear here.</p></div>}</div>}
      </div></div>
  </section>;
}
