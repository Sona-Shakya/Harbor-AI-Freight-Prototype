import React, {useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowRight,Plus,House,Stack,UsersThree,GearSix,FileText,Paperclip,X,Check,CheckCircle,Clock,Info,CaretLeft,CaretRight,CaretDown,CaretUp,ArrowSquareOut,ChatCircleDots,MagnifyingGlass,DownloadSimple,WarningCircle,Boat,WaveSine,SignOut,CalendarBlank,ClipboardText,ShieldCheck,Cube,Receipt,Path,Tag,Truck,Files,Calculator,Umbrella,Handshake,ChartBar,ShoppingBag,ShoppingCart,CalendarCheck,MapPin,SquaresFour,NotePencil,ArrowCounterClockwise,List,Trash,EnvelopeSimple,Eye,EyeSlash,LockKey,Buildings,GitBranch,IdentificationBadge,Anchor,Package,ArrowsClockwise} from '@phosphor-icons/react';
import {modules,labels,numeric,dates,initialRecords,seedMissions,seedSettingCategories,money,TODAY} from './data';
import SettingsRegistry from './SettingsRegistry';
import UserManagement from './UserManagement';
import RolePermissionMaster from './RolePermissionMaster';
import OrganizationView from './OrganizationView';
import CustomerMaster from './CustomerMaster';
import VendorMaster from './VendorMaster';
import BranchMaster from './BranchMaster';
import AgentMaster from './AgentMaster';
import PortMaster from './PortMaster';
import CfsMaster from './CfsMaster';
import DriverMaster from './DriverMaster';
import LoadBoard from './LoadBoard';
import './styles/loadBoard.css';
import QuoteRateManagement from './QuoteRateManagement';
import './styles/quotingRate.css';
import CarrierFleetManagement from './CarrierFleetManagement';
import './styles/carrierFleet.css';
import BookingManagement from './BookingManagement';
import LoginOtpScreen from './LoginOtpScreen.jsx';
import AcceptInvitation from './AcceptInvitation.jsx';
import ForgotPassword from './ForgotPassword.jsx';
import VerifyResetOtp from './VerifyResetOtp.jsx';
import ResetPassword from './ResetPassword.jsx';
import {login as apiLogin, getProfile, getUserOrganizations, switchOrganizationContext} from './api';
import * as authService from './services/authService';
const icons={SquaresFour,UsersThree,Cube,ShoppingBag,ShoppingCart,Path,ChatCircleDots,Tag,CalendarCheck,Boat,MapPin,Truck,Files,ShieldCheck,Calculator,Receipt,Umbrella,Handshake,ChartBar,GearSix,Buildings,GitBranch,IdentificationBadge,Anchor,Package};
const STORE='harbor-demo-v1';
const load=()=>{try {return JSON.parse(sessionStorage.getItem(STORE))||{}}catch{return {}}};
const uid=p=>p+'-'+Array.from(crypto.getRandomValues(new Uint8Array(4)),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
const display=(k,v)=>v===''||v==null?'Not confirmed':numeric.includes(k)&&['amount','actual','expected','duty','destinationCharge'].includes(k)?money(v):dates.includes(k)?new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):String(v);
function Badge({children}){const c=/^(approved|approved locally|active|confirmed|delivered|final|resolved|valid|paid|settled|reviewed|ready|reconciled|complete|selected)$/i.test(children)?'green':/pending|review|correction|incomplete|exception|disputed|awaiting/i.test(children)?'amber':'gray';return <span className={'badge '+c}>{children}</span>}
function Btn({children,onClick,primary=false,disabled=false,className='',...props}){return <button className={(primary?'btn primary':'btn')+' '+className} onClick={onClick} disabled={disabled} {...props}>{children}</button>}
const moduleGroups=['Workspace','Orders','Freight','Operations','Finance','Network'];
function ModuleNavigation({moduleId,view,records,openModule,hasPermission}){
  const isAdminSelected = view === 'records' && moduleId === 'admin';
  const isUsersSelected = view === 'records' && moduleId === 'users';
  const isRolesSelected = view === 'records' && moduleId === 'roles';
  const isOrgSelected = view === 'records' && moduleId === 'organization';
  const isCustomersSelected = view === 'records' && moduleId === 'customers';
  const isVendorsSelected = view === 'records' && moduleId === 'vendors';
  const isBranchesSelected = view === 'records' && moduleId === 'branches';
  const isAgentsSelected = view === 'records' && moduleId === 'agents';
  const isPortsSelected = view === 'records' && moduleId === 'ports';
  const isCfsSelected = view === 'records' && moduleId === 'cfs';
  const isDriversSelected = view === 'records' && moduleId === 'drivers';
  const isLoadBoardSelected = view === 'records' && moduleId === 'load_board';
  const isQuotesSelected = view === 'records' && (moduleId === 'quotes' || moduleId === 'rates');
  const isFleetSelected = view === 'records' && (moduleId === 'fleet' || moduleId === 'carrier_fleet');
  const isBookingsSelected = view === 'records' && moduleId === 'bookings';

  const isChildActive = isUsersSelected || isRolesSelected || isOrgSelected || isCustomersSelected || isVendorsSelected || isBranchesSelected || isAgentsSelected || isPortsSelected || isCfsSelected || isDriversSelected || isLoadBoardSelected || isQuotesSelected || isFleetSelected || isBookingsSelected;

  const canReadSettings = hasPermission('system_settings', 'read');
  const canReadLoadBoard = hasPermission('load_board', 'read');
  const canReadQuotes = hasPermission('quotes', 'read') || hasPermission('rates', 'read') || hasPermission('rate_agreements', 'read');
  const canReadFleet = hasPermission('vehicles', 'read') || hasPermission('fleet', 'read') || hasPermission('fleet_assignments', 'read') || hasPermission('hos_logs', 'read');
  const canReadBookings = hasPermission('shipments', 'read') || hasPermission('bookings', 'read');
  const canReadUsers = hasPermission('users', 'read');
  const canReadRoles = hasPermission('roles', 'read');
  const canReadOrg = hasPermission('organizations', 'read');
  const canReadCustomers = hasPermission('customers', 'read');
  const canReadVendors = hasPermission('vendors', 'read');
  const canReadBranches = hasPermission('branches', 'read');
  const canReadAgents = hasPermission('agents', 'read');
  const canReadPorts = hasPermission('ports', 'read');
  const canReadCfs = hasPermission('cfs', 'read');
  const canReadDrivers = hasPermission('drivers', 'read');

  const canReadPeople = canReadUsers || canReadRoles;
  const canReadBusiness = canReadOrg || canReadCustomers || canReadVendors || canReadBranches || canReadAgents;
  const canReadLocations = canReadPorts || canReadCfs;
  const canReadTransportation = canReadDrivers || canReadLoadBoard || canReadQuotes || canReadFleet || canReadBookings;
  const canReadManage = canReadPeople || canReadBusiness || canReadLocations || canReadTransportation;

  const [manageOpen, setManageOpen] = useState(true);

  // Automatically keep Manage dropdown OPEN when one of its child pages is active
  useEffect(() => {
    if (isChildActive) {
      setManageOpen(true);
    }
  }, [isChildActive]);

  const handleManageClick = () => {
    if (!isChildActive) {
      setManageOpen(true);
      if (canReadUsers) openModule('users');
      else if (canReadRoles) openModule('roles');
      else if (canReadOrg) openModule('organization');
      else if (canReadCustomers) openModule('customers');
      else if (canReadVendors) openModule('vendors');
      else if (canReadBranches) openModule('branches');
      else if (canReadAgents) openModule('agents');
      else if (canReadPorts) openModule('ports');
      else if (canReadCfs) openModule('cfs');
      else if (canReadDrivers) openModule('drivers');
      else if (canReadLoadBoard) openModule('load_board');
      else if (canReadQuotes) openModule('quotes');
      else if (canReadFleet) openModule('fleet');
      else if (canReadBookings) openModule('bookings');
    } else {
      setManageOpen(v => !v);
    }
  };

  const handleCaretClick = (e) => {
    e.stopPropagation();
    setManageOpen(v => !v);
  };

  return (
    <nav className="module-navigation" aria-label="Freight modules">
      <section className="module-nav-group">
        {/* Manage section */}
        {canReadManage && (
          <div className="manage-group masters-group">
            <button
              type="button"
              className={'module-nav-item manage-dropdown-toggle masters-dropdown-toggle ' + (isChildActive ? 'selected' : '')}
              aria-expanded={manageOpen}
              aria-controls="manage-menu"
              aria-current={isChildActive ? 'page' : undefined}
              title="Manage"
              onClick={handleManageClick}
            >
              <Stack size={20} />
              <span>Manage</span>
              <span
                className="manage-caret masters-caret"
                role="button"
                tabIndex={0}
                title={manageOpen ? "Collapse Manage" : "Expand Manage"}
                aria-label={manageOpen ? "Collapse Manage" : "Expand Manage"}
                onClick={handleCaretClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCaretClick(e);
                  }
                }}
              >
                {manageOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
              </span>
            </button>

            {/* Subgroups under Manage: People, Business, Locations, Transportation */}
            {manageOpen && (
              <div id="manage-menu" className="manage-sub-menu masters-sub-menu" role="region" aria-label="Manage sub-menu">
                {/* People Group */}
                {canReadPeople && (
                  <div className="nav-subgroup">
                    <div className="nav-subgroup-label">People</div>
                    {canReadUsers && (
                      <button
                        key="users"
                        className={'module-nav-item sub-item ' + (isUsersSelected ? 'selected' : '')}
                        aria-current={isUsersSelected ? 'page' : undefined}
                        title="Users"
                        onClick={() => openModule('users')}
                      >
                        <UsersThree size={20} />
                        <span>Users</span>
                        <span className="module-record-count">{records.users?.length ?? ''}</span>
                      </button>
                    )}

                    {canReadRoles && (
                      <button
                        key="roles"
                        className={'module-nav-item sub-item ' + (isRolesSelected ? 'selected' : '')}
                        aria-current={isRolesSelected ? 'page' : undefined}
                        title="Roles & Permissions"
                        onClick={() => openModule('roles')}
                      >
                        <ShieldCheck size={20} />
                        <span>Roles & Permissions</span>
                        <span className="module-record-count">{records.roles?.length ?? ''}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Business Group */}
                {canReadBusiness && (
                  <div className="nav-subgroup">
                    <div className="nav-subgroup-label">Business</div>
                    {canReadOrg && (
                      <button
                        key="organization"
                        className={'module-nav-item sub-item ' + (isOrgSelected ? 'selected' : '')}
                        aria-current={isOrgSelected ? 'page' : undefined}
                        title="Organization"
                        onClick={() => openModule('organization')}
                      >
                        <Buildings size={20} />
                        <span>Organization</span>
                        <span className="module-record-count">{records.organization?.length ?? ''}</span>
                      </button>
                    )}

                    {canReadCustomers && (
                      <button
                        key="customers"
                        className={'module-nav-item sub-item ' + (isCustomersSelected ? 'selected' : '')}
                        aria-current={isCustomersSelected ? 'page' : undefined}
                        title="Customers"
                        onClick={() => openModule('customers')}
                      >
                        <ShoppingBag size={20} />
                        <span>Customers</span>
                      </button>
                    )}

                    {canReadVendors && (
                      <button
                        key="vendors"
                        className={'module-nav-item sub-item ' + (isVendorsSelected ? 'selected' : '')}
                        aria-current={isVendorsSelected ? 'page' : undefined}
                        title="Vendors"
                        onClick={() => openModule('vendors')}
                      >
                        <Truck size={20} />
                        <span>Vendors</span>
                      </button>
                    )}

                    {canReadBranches && (
                      <button
                        key="branches"
                        className={'module-nav-item sub-item ' + (isBranchesSelected ? 'selected' : '')}
                        aria-current={isBranchesSelected ? 'page' : undefined}
                        title="Branches"
                        onClick={() => openModule('branches')}
                      >
                        <GitBranch size={20} />
                        <span>Branches</span>
                      </button>
                    )}

                    {canReadAgents && (
                      <button
                        key="agents"
                        className={'module-nav-item sub-item ' + (isAgentsSelected ? 'selected' : '')}
                        aria-current={isAgentsSelected ? 'page' : undefined}
                        title="Agents"
                        onClick={() => openModule('agents')}
                      >
                        <IdentificationBadge size={20} />
                        <span>Agents</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Locations Group */}
                {canReadLocations && (
                  <div className="nav-subgroup">
                    <div className="nav-subgroup-label">Locations</div>
                    {canReadPorts && (
                      <button
                        key="ports"
                        className={'module-nav-item sub-item ' + (isPortsSelected ? 'selected' : '')}
                        aria-current={isPortsSelected ? 'page' : undefined}
                        title="Ports"
                        onClick={() => openModule('ports')}
                      >
                        <Anchor size={20} />
                        <span>Ports</span>
                      </button>
                    )}

                    {canReadCfs && (
                      <button
                        key="cfs"
                        className={'module-nav-item sub-item ' + (isCfsSelected ? 'selected' : '')}
                        aria-current={isCfsSelected ? 'page' : undefined}
                        title="CFS Locations"
                        onClick={() => openModule('cfs')}
                      >
                        <Package size={20} />
                        <span>CFS Locations</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Transportation Group */}
                {canReadTransportation && (
                  <div className="nav-subgroup">
                    <div className="nav-subgroup-label">Transportation</div>
                    {canReadDrivers && (
                      <button
                        key="drivers"
                        className={'module-nav-item sub-item ' + (isDriversSelected ? 'selected' : '')}
                        aria-current={isDriversSelected ? 'page' : undefined}
                        title="Drivers"
                        onClick={() => openModule('drivers')}
                      >
                        <Truck size={20} />
                        <span>Drivers</span>
                      </button>
                    )}

                    {canReadLoadBoard && (
                      <button
                        key="load_board"
                        className={'module-nav-item sub-item ' + (isLoadBoardSelected ? 'selected' : '')}
                        aria-current={isLoadBoardSelected ? 'page' : undefined}
                        title="Find Loads"
                        onClick={() => openModule('load_board')}
                      >
                        <Truck size={20} />
                        <span>Find Loads</span>
                        <span className="module-record-count">{records.load_board?.length ?? ''}</span>
                      </button>
                    )}

                    {canReadQuotes && (
                      <button
                        key="quotes"
                        className={'module-nav-item sub-item ' + (isQuotesSelected ? 'selected' : '')}
                        aria-current={isQuotesSelected ? 'page' : undefined}
                        title="Quotes & Rates"
                        onClick={() => openModule('quotes')}
                      >
                        <Tag size={20} />
                        <span>Quotes & Rates</span>
                        <span className="module-record-count">{records.quotes?.length ?? ''}</span>
                      </button>
                    )}

                    {canReadFleet && (
                      <button
                        key="fleet"
                        className={'module-nav-item sub-item ' + (isFleetSelected ? 'selected' : '')}
                        aria-current={isFleetSelected ? 'page' : undefined}
                        title="Carriers & Fleet"
                        onClick={() => openModule('fleet')}
                      >
                        <Truck size={20} />
                        <span>Carriers & Fleet</span>
                        <span className="module-record-count">{records.fleet?.length ?? ''}</span>
                      </button>
                    )}

                    {canReadBookings && (
                      <button
                        key="bookings"
                        className={'module-nav-item sub-item ' + (isBookingsSelected ? 'selected' : '')}
                        aria-current={isBookingsSelected ? 'page' : undefined}
                        title="Bookings"
                        onClick={() => openModule('bookings')}
                      >
                        <CalendarCheck size={20} />
                        <span>Bookings</span>
                        <span className="module-record-count">{records.bookings?.length ?? ''}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings row below Manage */}
        {canReadSettings && (
          <button
            key="admin"
            className={'module-nav-item ' + (isAdminSelected ? 'selected' : '')}
            aria-current={isAdminSelected ? 'page' : undefined}
            title="Settings"
            onClick={() => openModule('admin')}
          >
            <GearSix size={20} />
            <span>Settings</span>
            <span className="module-record-count">{records.admin?.length ?? ''}</span>
          </button>
        )}
      </section>
    </nav>
  );
}
function Modal({title,onClose,children,wide=false}){const box=useRef();useEffect(()=>{const before=document.activeElement;box.current?.focus();const key=e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const els=[...box.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled);if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0]?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);before?.focus()}},[]);return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section ref={box} tabIndex={-1} className={'modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={22}/></button></header>{children}</section></div>}
function RecordForm({module,record,onSave,onClose}){const [form,setForm]=useState(record||Object.fromEntries(module.fields.map(k=>[k,k==='status'?module.statuses[0]:''])));const [error,setError]=useState('');function save(e){e.preventDefault();if(form.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)){setError('Enter a valid email address.');return}if(form.allocated!==undefined&&Number(form.allocated)>Number(form.quantity)){setError('Allocated quantity cannot exceed the order quantity.');return}if(form.etd&&form.eta&&form.etd>form.eta){setError('Arrival cannot be before departure.');return}onSave({...form,id:record?.id||uid(module.id.slice(0,3).toUpperCase())});}return <Modal title={(record?'Edit ':'New ')+module.name.toLowerCase()} onClose={onClose}><form onSubmit={save}><div className="form-grid">{module.fields.map((k,i)=><label key={k}>{labels[k]||k[0].toUpperCase()+k.slice(1)}{k==='status'?<select value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}>{module.statuses.map(s=><option key={s}>{s}</option>)}</select>:<input required={i===0||k==='quantity'} type={numeric.includes(k)?'number':dates.includes(k)?'date':k==='email'?'email':'text'} min={numeric.includes(k)?0:undefined} step="any" value={form[k]??''} onChange={e=>setForm({...form,[k]:numeric.includes(k)&&e.target.value!==''?Number(e.target.value):e.target.value})}/>}</label>)}</div>{error&&<p className="error" role="alert">{error}</p>}<div className="modal-actions"><Btn onClick={onClose} type="button">Cancel</Btn><Btn primary type="submit">Save record</Btn></div></form></Modal>}

function LoginScreen({ onLogin, onForgotPassword, successNotice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Enter a valid work email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      await onLogin(email, password);
    } catch (error) {
      setError(
        error.message || 'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-form-panel">

        <div className="login-brand">
          <img src="/harbor-mark.png" alt="" />
          <span>Harbor</span>
        </div>

        <div className="login-form-wrap">

          <div className="login-eyebrow">
            AI-NATIVE FREIGHT MANAGEMENT
          </div>

          <h1>Welcome back</h1>

          <p className="login-intro">
            Sign in to plan shipments, review exceptions, and keep every
            import and export decision connected.
          </p>

          {successNotice && (
            <div className="login-notice-success" role="status">
              <CheckCircle size={18} />
              <span>{successNotice}</span>
            </div>
          )}

          <form className="login-form" onSubmit={submit}>

            <label>
              Work email

              <div className="login-field">
                <EnvelopeSimple size={20} />

                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                />
              </div>
            </label>

            <label>
              Password

              <div className="login-field">
                <LockKey size={20} />

                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                />

                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeSlash size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </label>

            <div className="login-options">

              <label className="remember">
                <input type="checkbox" />
                Keep me signed in
              </label>

              <button
                type="button"
                onClick={onForgotPassword}
              >
                Forgot password?
              </button>

            </div>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <Btn
              primary
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight size={18} />}
            </Btn>

          </form>

          <div className="login-note">
            <ShieldCheck size={16} />
            Secure authentication through the FMS backend.
          </div>

        </div>

        <footer>
          © 2026 Harbor · Global trade, more human.
        </footer>

      </section>

      <aside className="login-story">

        <div className="login-story-content">

          <span className="story-kicker">
            One intelligent workspace
          </span>

          <h2>
            Move freight with clarity, not more software.
          </h2>

          <p>
            Harbor brings conversations, operational records, evidence,
            and approvals together—so your team always knows what needs
            attention next.
          </p>

          <div className="login-feature">
            <ChatCircleDots size={24} />
            <span>
              <strong>Ask Harbor</strong>
              <small>
                Turn an import or export goal into a reviewable plan.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <Files size={24} />
            <span>
              <strong>Connected evidence</strong>
              <small>
                Keep orders, offers, documents, and invoices linked.
              </small>
            </span>
          </div>

          <div className="login-feature">
            <ShieldCheck size={24} />
            <span>
              <strong>Human-controlled actions</strong>
              <small>
                Review every draft and decision before anything moves.
              </small>
            </span>
          </div>

        </div>

        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />

      </aside>
    </main>
  );
}
export function App() {
  const [authenticated, setAuthenticated] = useState(
    () => authService.hasToken()
  );
  const [otpChallenge, setOtpChallenge] = useState(null);
  const [pathname, setPathname] = useState(() => {
    try {
      return window.location.pathname;
    } catch {
      return '/';
    }
  });

  // Password Recovery flow state (in-memory only, no localStorage)
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoveryStep, setRecoveryStep] = useState(() => {
    try {
      if (window.location.pathname === '/forgot-password') return 'forgot_password';
      if (window.location.pathname === '/verify-reset-otp') return 'verify_otp';
      if (window.location.pathname === '/reset-password') return 'reset_password';
    } catch {}
    return null;
  });
  const [loginSuccessNotice, setLoginSuccessNotice] = useState('');

  useEffect(() => {
    const expire = () => {
      setOtpChallenge(null);
      setAuthenticated(false);
      setRecoveryStep(null);
      setRecoveryEmail('');
      setResetToken('');
    };

    const handlePopState = () => {
      const path = window.location.pathname;
      setPathname(path);
      if (path === '/forgot-password') {
        setRecoveryStep('forgot_password');
      } else if (path === '/verify-reset-otp') {
        setRecoveryStep('verify_otp');
      } else if (path === '/reset-password') {
        setRecoveryStep('reset_password');
      } else if (path === '/login' || path === '/') {
        setRecoveryStep(null);
      }
    };

    window.addEventListener('harbor-auth-expired', expire);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('harbor-auth-expired', expire);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateTo = (path) => {
    try {
      window.history.pushState({}, '', path);
      setPathname(path);
    } catch {
      window.location.href = path;
    }
  };

  const handleGoToLogin = () => {
    authService.logout();
    setAuthenticated(false);
    setOtpChallenge(null);
    setRecoveryStep(null);
    setRecoveryEmail('');
    setResetToken('');
    setLoginSuccessNotice('');
    navigateTo('/login');
  };

  const handleStartForgotPassword = () => {
    setRecoveryStep('forgot_password');
    setLoginSuccessNotice('');
    setRecoveryEmail('');
    setResetToken('');
    navigateTo('/forgot-password');
  };

  const handleForgotPasswordSuccess = (email) => {
    setRecoveryEmail(email);
    setRecoveryStep('verify_otp');
    navigateTo('/verify-reset-otp');
  };

  const handleVerifyOtpSuccess = (token) => {
    setResetToken(token);
    setRecoveryStep('reset_password');
    navigateTo('/reset-password');
  };

  const handleResetPasswordSuccess = (message) => {
    setResetToken('');
    setRecoveryEmail('');
    setRecoveryStep(null);
    setLoginSuccessNotice(message || 'Password reset successfully. Please login with your new password.');
    navigateTo('/login');
  };

  const handleBackToLoginFromRecovery = () => {
    setRecoveryStep(null);
    setRecoveryEmail('');
    setResetToken('');
    setLoginSuccessNotice('');
    navigateTo('/login');
  };

  const handleGoToForgotPassword = () => {
    setRecoveryStep('forgot_password');
    setResetToken('');
    navigateTo('/forgot-password');
  };

  async function login(email, password) {
    const result = await apiLogin(email, password);

    if (result?.otpRequired) {
      setOtpChallenge({
        otpToken: result.otpToken,
        phone: result.phone || '',
      });
      setAuthenticated(false);
      return;
    }

    setOtpChallenge(null);
    setAuthenticated(true);
  }

  const handleOtpSuccess = (response) => {
    setOtpChallenge(null);
    setAuthenticated(true);
  };

  const handleOtpCancel = () => {
    setOtpChallenge(null);
    setAuthenticated(false);
  };

  function logout() {
    authService.logout();
    setOtpChallenge(null);
    setRecoveryStep(null);
    setRecoveryEmail('');
    setResetToken('');
    setAuthenticated(false);
    navigateTo('/login');
  }

  // Public Accept Invitation Route (unauthenticated)
  if (pathname === '/accept-invitation' || pathname.startsWith('/accept-invitation')) {
    return <AcceptInvitation onGoToLogin={handleGoToLogin} />;
  }

  if (authenticated) {
    return <HarborWorkspace onLogout={logout} />;
  }

  if (otpChallenge) {
    return (
      <LoginOtpScreen
        challenge={otpChallenge}
        onSuccess={handleOtpSuccess}
        onCancel={handleOtpCancel}
      />
    );
  }

  // Password Recovery Flow
  if (recoveryStep === 'forgot_password') {
    return (
      <ForgotPassword
        onSuccess={handleForgotPasswordSuccess}
        onBackToLogin={handleBackToLoginFromRecovery}
      />
    );
  }

  if (recoveryStep === 'verify_otp') {
    return (
      <VerifyResetOtp
        email={recoveryEmail}
        onSuccess={handleVerifyOtpSuccess}
        onBackToLogin={handleBackToLoginFromRecovery}
        onGoToForgotPassword={handleGoToForgotPassword}
      />
    );
  }

  if (recoveryStep === 'reset_password') {
    return (
      <ResetPassword
        resetToken={resetToken}
        onSuccess={handleResetPasswordSuccess}
        onBackToLogin={handleBackToLoginFromRecovery}
        onGoToForgotPassword={handleGoToForgotPassword}
      />
    );
  }

  return (
    <LoginScreen
      onLogin={login}
      onForgotPassword={handleStartForgotPassword}
      successNotice={loginSuccessNotice}
    />
  );
}

const getModuleFromPath = (path) => {
  if (path === '/customers' || path.startsWith('/customers/')) return 'customers';
  if (path === '/vendors' || path.startsWith('/vendors/')) return 'vendors';
  if (path === '/branches' || path.startsWith('/branches/')) return 'branches';
  if (path === '/agents' || path.startsWith('/agents/')) return 'agents';
  if (path === '/ports' || path.startsWith('/ports/')) return 'ports';
  if (path === '/cfs' || path.startsWith('/cfs/')) return 'cfs';
  if (path === '/drivers' || path.startsWith('/drivers/')) return 'drivers';
  if (path === '/bookings' || path.startsWith('/bookings/')) return 'bookings';
  if (path === '/shipments' || path.startsWith('/shipments/')) return 'shipments';
  if (path === '/load-board' || path.startsWith('/load-board/')) return 'load_board';
  if (path === '/quotes' || path.startsWith('/quotes/') || path === '/rates' || path.startsWith('/rates/')) return 'quotes';
  if (path === '/fleet' || path.startsWith('/fleet/') || path === '/carrier-fleet' || path.startsWith('/carrier-fleet/')) return 'fleet';
  if (path === '/users' || path.startsWith('/users/')) return 'users';
  if (path === '/roles' || path.startsWith('/roles/')) return 'roles';
  if (path === '/organization' || path.startsWith('/organization/')) return 'organization';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return null;
};

function HarborWorkspace({onLogout}){
      const [profile, setProfile] = useState(null);
      const [profileLoading, setProfileLoading] = useState(true);
      const role = profile?.organization_roles?.[0]?.role;
const permissionSet = role?.permission_set || {};

const hasPermission = (module, action) => {
  if (role?.name === 'Platform Admin') {
    return true;
  }
  let mod = module;
  let act = action;
  if (!act && typeof mod === 'string' && mod.includes('.')) {
    [mod, act] = mod.split('.');
  }
  const perms =
    permissionSet[mod] ||
    permissionSet[mod + 's'] ||
    permissionSet[mod.replace(/s$/, '')] ||
    [];
  if (Array.isArray(perms) && perms.includes(act)) {
    return true;
  }

  // System Settings module baseline defaults matching backend authorizePermission
  if (mod === 'system_settings' || mod === 'settings') {
    if (act === 'read') {
      return ['Platform Admin', 'Company Admin', 'Dispatcher', 'Finance', 'Shipper User'].includes(role?.name);
    }
    if (act === 'override') {
      return ['Platform Admin', 'Company Admin'].includes(role?.name);
    }
    return role?.name === 'Platform Admin';
  }

  // Ports module baseline defaults matching backend authorizePermission
  if (mod === 'ports' || mod === 'port') {
    if (act === 'read') {
      return ['Platform Admin', 'Company Admin', 'Dispatcher', 'Finance', 'Shipper User'].includes(role?.name);
    }
    return role?.name === 'Platform Admin';
  }

  // CFS module baseline defaults matching backend authorizePermission
  if (mod === 'cfs') {
    if (act === 'read') {
      return ['Platform Admin', 'Company Admin', 'Dispatcher', 'Finance', 'Shipper User'].includes(role?.name);
    }
    return role?.name === 'Platform Admin';
  }

  // Driver Master module baseline defaults
  if (mod === 'drivers' || mod === 'driver') {
    if (['Platform Admin', 'Company Admin', 'Dispatcher'].includes(role?.name)) {
      return true;
    }
    if (act === 'read') {
      return true;
    }
    return false;
  }

  // Load Board & Freight Matching module (M3)
  if (mod === 'load_board' || mod === 'loadboard' || mod === 'loads') {
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin') {
      return true;
    }
    if (role?.name === 'Shipper User') {
      return ['create', 'read', 'update', 'delete', 'bids_read', 'bids_update', 'matches', 'metrics'].includes(act);
    }
    if (role?.name === 'Dispatcher' || role?.name === 'Driver') {
      return ['read', 'book', 'bid', 'preferences'].includes(act);
    }
    if (act === 'read') {
      return ['Platform Admin', 'Company Admin', 'Dispatcher', 'Finance', 'Shipper User', 'Carrier Admin'].includes(role?.name);
    }
    return false;
  }

  // Quotes module (M4: FR-4.1, FR-4.8)
  if (mod === 'quotes' || mod === 'quote' || mod === 'quoting') {
    if (role?.name === 'Driver') return false;
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Shipper User') {
      return true;
    }
    if (role?.name === 'Dispatcher') {
      return act === 'read';
    }
    if (role?.name === 'Finance' || role?.name === 'Finance User') {
      return ['read', 'audit'].includes(act);
    }
    if (act === 'read') return true;
    return false;
  }

  // Rates, Lane History & Tariffs (M4: FR-4.3, FR-4.6, FR-4.7)
  if (mod === 'rates' || mod === 'rate' || mod === 'lane_history' || mod === 'lane-history') {
    if (role?.name === 'Driver') return false;
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin') return true;
    if (role?.name === 'Shipper User') {
      return ['read', 'history', 'compare'].includes(act) || act === 'read';
    }
    if (role?.name === 'Dispatcher') {
      return ['read', 'history'].includes(act) || act === 'read';
    }
    if (role?.name === 'Finance' || role?.name === 'Finance User') {
      return ['read', 'history', 'audit'].includes(act) || act === 'read';
    }
    if (act === 'read') return true;
    return false;
  }

  // Rate Agreements (M4: FR-4.2)
  if (mod === 'rate_agreements' || mod === 'rate_agreement' || mod === 'rate-agreements' || mod === 'agreements') {
    if (role?.name === 'Driver') return false;
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Shipper User') {
      return true;
    }
    if (role?.name === 'Dispatcher') return act === 'read';
    if (role?.name === 'Finance' || role?.name === 'Finance User') return ['read', 'audit'].includes(act) || act === 'read';
    if (act === 'read') return true;
    return false;
  }

  // Rate Confirmations (M4: FR-4.5)
  if (mod === 'rate_confirmations' || mod === 'rate_confirmation' || mod === 'rate-confirmations') {
    if (role?.name === 'Driver') return false;
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin') return true;
    if (role?.name === 'Shipper User') return ['create', 'read'].includes(act) || act === 'read';
    if (role?.name === 'Dispatcher') return ['read', 'sign', 'update'].includes(act) || act === 'read';
    if (role?.name === 'Finance' || role?.name === 'Finance User') return ['read', 'audit'].includes(act) || act === 'read';
    if (act === 'read') return true;
    return false;
  }

  // Carrier & Fleet Management module (M5: FR-5.1 to FR-5.8)
  if (mod === 'vehicles' || mod === 'vehicle' || mod === 'fleet') {
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Dispatcher') return true;
    if (role?.name === 'Driver') {
      return act === 'read' || act === 'read_assigned';
    }
    if (act === 'read') return true;
    return false;
  }

  if (mod === 'vehicle_maintenance' || mod === 'maintenance') {
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Dispatcher') return true;
    if (role?.name === 'Driver') {
      if (act === 'read_cost') return false; // Driver cannot see maintenance costs
      return act === 'read';
    }
    if (act === 'read') return true;
    return false;
  }

  if (mod === 'hos_logs' || mod === 'hos' || mod === 'eld') {
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Dispatcher') return true;
    if (role?.name === 'Driver') {
      return act === 'read' || act === 'read_own' || act === 'create' || act === 'log' || act === 'sync';
    }
    if (act === 'read') return true;
    return false;
  }

  if (
    mod === 'carrier_compliance' ||
    mod === 'compliance' ||
    mod === 'carrier_insurance' ||
    mod === 'carrier_network_tiers' ||
    mod === 'carrier_scorecards' ||
    mod === 'scorecard' ||
    mod === 'scorecards'
  ) {
    if (role?.name === 'Driver') return false; // Driver cannot see carrier compliance / tiers / scorecards
    if (role?.name === 'Platform Admin') return true;
    if (role?.name === 'Company Admin') {
      if (mod === 'carrier_network_tiers' && act === 'update') return false; // Carriers cannot modify their own tier
      return true;
    }
    if (role?.name === 'Dispatcher') return act === 'read';
    if (role?.name === 'Finance' || role?.name === 'Finance User') return act === 'read';
    if (act === 'read') return true;
    return false;
  }

  if (mod === 'fleet_assignments' || mod === 'assignments') {
    if (role?.name === 'Driver') return act === 'read';
    if (role?.name === 'Platform Admin' || role?.name === 'Company Admin' || role?.name === 'Dispatcher') return true;
    if (act === 'read') return true;
    return false;
  }

  if (role?.name === 'Company Admin') {
    return true;
  }

  return false;
};

  useEffect(() => {
    setProfileLoading(true);
    getProfile()
      .then((response) => {
        const data = response?.data || null;
        setProfile(data);
      })
      .catch((error) => {
        console.error("Failed to load profile:", error);
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, []);

 const stored=useRef(load()).current;
 const initialMod = (typeof window !== 'undefined' && getModuleFromPath(window.location.pathname)) || 'admin';
 const [records,setRecords]=useState(()=>({...initialRecords, ...(stored.records||{})})),[missions,setMissions]=useState(stored.missions||seedMissions),[missionId,setMissionId]=useState('import'),[view,setView]=useState('records'),[tab,setTab]=useState('Conversation'),[moduleId,setModuleId]=useState(initialMod),[query,setQuery]=useState(''),[filter,setFilter]=useState('All statuses');
 const [modal,setModal]=useState(null),[toast,setToast]=useState(''),[input,setInput]=useState(''),[messages,setMessages]=useState(stored.messages||{}),[audit,setAudit]=useState(stored.audit||[]),[approvals,setApprovals]=useState(stored.approvals||{}),[selectedRate,setSelectedRate]=useState(stored.selectedRate||null),[draft,setDraft]=useState(stored.draft||'Please confirm destination handling and local charges for 600 control units moving from Shanghai to Chennai. Your offer OB-082 includes origin and ocean freight but excludes destination handling. Please confirm the total and validity.'),[settings,setSettings]=useState(stored.settings||seedSettingCategories),[settingAudit,setSettingAudit]=useState(stored.settingAudit||[]),[attachments,setAttachments]=useState([]),[busy,setBusy]=useState(false),[navOpen,setNavOpen]=useState(false),[sidebarCollapsed,setSidebarCollapsed]=useState(false),[planOpen,setPlanOpen]=useState(false);
 const scroll=useRef(),fileRef=useRef(),timer=useRef();
 const mission=missions.find(m=>m.id===missionId)||missions[0]; const type=mission.type; const mod=modules.find(m=>m.id===moduleId)||modules[0];
 useEffect(()=>{sessionStorage.setItem(STORE,JSON.stringify({records,missions,messages,audit,approvals,selectedRate,draft,settings,settingAudit}))},[records,missions,messages,audit,approvals,selectedRate,draft,settings,settingAudit]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t)}},[toast]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{const toggle=()=>setSidebarCollapsed(value=>!value);window.addEventListener('toggle-sidebar',toggle);return()=>window.removeEventListener('toggle-sidebar',toggle)},[]);
 useEffect(()=>{
   const onPop = () => {
     const m = getModuleFromPath(window.location.pathname);
     if (m) {
       setModuleId(m);
       setView('records');
     }
   };
   window.addEventListener('popstate', onPop);
   return () => window.removeEventListener('popstate', onPop);
 }, []);
 function log(text){setAudit(a=>[{id:uid('ACT'),text,time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})},...a])}
 function update(collection,record){setRecords(r=>({...r,[collection]:r[collection].some(x=>x.id===record.id)?r[collection].map(x=>x.id===record.id?record:x):[...r[collection],record]}));log(`${record.id} updated in ${modules.find(m=>m.id===collection).name}`)}
 function add(collection,record){setRecords(r=>({...r,[collection]:[...r[collection],record]}))}
 function notify(t){setToast(t)}
 function openModule(id) {
  if (id === 'admin' && !hasPermission('system_settings', 'read')) {
    notify('You do not have permission to access System Settings.');
    return;
  }
  if (id === 'users' && !hasPermission('users', 'read')) {
    notify('You do not have permission to access User Management.');
    return;
  }
  if (id === 'roles' && !hasPermission('roles', 'read')) {
    notify('You do not have permission to access Roles & Permissions.');
    return;
  }
  if (id === 'organization' && !hasPermission('organizations', 'read')) {
    notify('You do not have permission to access Organization.');
    return;
  }
  if (id === 'customers' && !hasPermission('customers', 'read')) {
    notify('You do not have permission to access Customer Master.');
    return;
  }
  if (id === 'vendors' && !hasPermission('vendors', 'read')) {
    notify('You do not have permission to access Vendor Master.');
    return;
  }
  if (id === 'branches' && !hasPermission('branches', 'read')) {
    notify('You do not have permission to access Branch Master.');
    return;
  }
  if (id === 'agents' && !hasPermission('agents', 'read')) {
    notify('You do not have permission to access Agent Master.');
    return;
  }
  if (id === 'ports' && !hasPermission('ports', 'read')) {
    notify('You do not have permission to access Port Master.');
    return;
  }
  if (id === 'cfs' && !hasPermission('cfs', 'read')) {
    notify('You do not have permission to access CFS Master.');
    return;
  }
  if (id === 'drivers' && !hasPermission('drivers', 'read')) {
    notify('You do not have permission to access Driver Master.');
    return;
  }
  if (id === 'load_board' && !hasPermission('load_board', 'read')) {
    notify('You do not have permission to access Load Board & Freight Matching.');
    return;
  }
  if ((id === 'quotes' || id === 'rates') && !hasPermission('quotes', 'read')) {
    notify('You do not have permission to access Quotes & Rates.');
    return;
  }
  if ((id === 'fleet' || id === 'carrier_fleet') && !hasPermission('vehicles', 'read') && !hasPermission('fleet', 'read') && !hasPermission('hos_logs', 'read')) {
    notify('You do not have permission to access Carrier & Fleet.');
    return;
  }
  if (id === 'bookings' && !hasPermission('shipments', 'read') && !hasPermission('bookings', 'read')) {
    notify('You do not have permission to access Bookings.');
    return;
  }

  setModuleId(id);
  setView('records');
  setQuery('');
  setFilter('All statuses');
  setNavOpen(false);

  const moduleUrls = {
    bookings: '/bookings',
    customers: '/customers',
    vendors: '/vendors',
    branches: '/branches',
    agents: '/agents',
    ports: '/ports',
    cfs: '/cfs',
    drivers: '/drivers',
    shipments: '/shipments',
    load_board: '/load-board',
    quotes: '/quotes',
    rates: '/quotes',
    fleet: '/fleet',
    carrier_fleet: '/fleet',
    users: '/users',
    roles: '/roles',
    organization: '/organization',
    admin: '/admin'
  };
  const targetUrl = moduleUrls[id];
  if (targetUrl && window.location.pathname !== targetUrl) {
    window.history.pushState({}, '', targetUrl);
  } else if (!targetUrl && window.location.pathname !== '/') {
    window.history.pushState({}, '', '/');
  }
}
 function openMission(id){setMissionId(id);setView('mission');setTab('Conversation');setInput('');setAttachments([]);setNavOpen(false)}
 function detail(id,collection){const c=collection||Object.keys(records).find(k=>records[k]?.some?.(x=>x.id===id));if(c&&records[c]){setModal({kind:'detail',collection:c,record:records[c].find(x=>x.id===id)})}}
 function approve(key){setApprovals(a=>({...a,[key]:true}));log(`${key} draft approved locally; no external action executed`);notify('Draft approved. No external message has been sent.')}
 const importBooked=records.bookings.find(x=>x.reference==='PO-1042');
 const ob=records.rates.find(x=>x.id==='OB-082'); const doc=records.documents.find(x=>x.id==='DOC-04');const inv=records.invoices[0];
 function addReply(question,reply){setMessages(m=>({...m,[missionId]:[...(m[missionId]||[]),{role:'user',text:question},{role:'assistant',text:reply}]}));setTimeout(()=>scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'}),50)}
 function ask(e){e?.preventDefault();if(!input.trim()||busy)return;const q=input.trim();setInput('');setBusy(true);timer.current=setTimeout(()=>{const lower=q.toLowerCase();let answer='I can help you explore this sample workspace. Try “compare offers”, “check documents”, “show landed cost”, or “what needs approval”. Use Records to create or edit data. This prototype uses scripted responses, not a connected AI model.';if(/rate|offer|quot|compare/.test(lower))answer=records.rates.map(r=>`${r.partner}: ${money(Number(r.amount)+Number(r.destinationCharge||0))}${r.destinationCharge===''?' known charges; destination handling is missing':' complete quoted total'}. Valid until ${r.validUntil}.`).join('\n')+'\nOpen Work products to review and award an offer.';else if(/cost|landed/.test(lower)){const sum=records.costs.filter(r=>r.reference==='IMP-204').reduce((s,r)=>s+Number(r.amount||0),0);answer=`IMP-204 known estimated cost: ${money(sum)}; ${money(sum/600)} per unit for 600 units. Destination handling, duties, taxes and final delivery may be additional. These are sample calculations, not a final landed cost. Open Costs & landed cost to review allocations.`}else if(/doc|packing/.test(lower))answer=`Packing list EXP-118 is ${doc.status.toLowerCase()} (version ${doc.version}). ${doc.status==='Needs correction'?'The packing list shows 380 units; SO-558 requires 400. Review the discrepancy before approving.':'The reviewed draft shows 400 units, matching SO-558.'} View the export mission for the review workflow.`;else if(/invoice|surcharge/.test(lower))answer=`Invoice ${inv.id} is ${money(inv.amount)} against ${money(inv.expected)} agreed: a ${money(inv.amount-inv.expected)} variance. Current status: ${inv.status}. Open the invoice mission to review or dispute it.`;else if(/book/.test(lower))answer=importBooked?`Booking ${importBooked.id} is ${importBooked.status.toLowerCase()}. This is a local sample record; no carrier request has been transmitted.`:'A booking has not been requested. Review Work products, select a complete offer and prepare a booking draft. Carrier submission is not connected.';else if(/approv|next|risk|delay/.test(lower))answer=type==='import'?`${approvals.import?'Clarification draft approved locally.':'Destination-charge clarification draft needs your approval.'} ${ob.destinationCharge===''?'OceanBridge destination handling is still unconfirmed.':'OceanBridge destination charge has been recorded.'} Booking requires an awarded complete offer.`:type==='export'?`Packing list: ${doc.status}. Review document quantities and broker checklist before release.`:`Invoice ${inv.id}: ${inv.status}. The ${money(inv.amount-inv.expected)} difference needs a decision.`;addReply(q,answer);setBusy(false)},600)}
 function exportCsv(){const rows=records[moduleId]||[];const keys=['id',...mod.fields];const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';download(`${moduleId}.csv`,[keys.join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\n'),'text/csv');notify('CSV exported')}
 function download(name,text,mime='text/plain'){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function createBooking(){if(!selectedRate){notify('Select a complete offer first.');return}if(importBooked){detail(importBooked.id,'bookings');return}const rate=records.rates.find(r=>r.id===selectedRate);if(rate.destinationCharge===''||rate.validUntil<TODAY){notify('This offer is incomplete or expired. Choose a complete valid offer.');return}const b={id:uid('BK'),name:'Shanghai import booking',reference:'PO-1042',partner:rate.partner,origin:'Shanghai',destination:'Chennai',etd:'2026-09-19',eta:'2026-09-28',status:'Draft'};add('bookings',b);update('shipments',{...records.shipments.find(x=>x.id==='IMP-204'),provider:rate.partner,status:'Planned'});update('planning',{...records.planning.find(x=>x.id==='PLAN-204'),status:'Ready for booking'});log('Booking draft created from approved offer '+rate.id);notify('Booking draft created. No carrier request sent.');detailAfter(b,'bookings')}
 function detailAfter(record,collection){setModal({kind:'detail',record,collection})}
 function award(rate){if(rate.destinationCharge===''||rate.validUntil<TODAY){notify('Confirm all charges and validity before awarding.');return}setSelectedRate(rate.id);update('rfqs',{...records.rfqs[0],status:'Awarded'});update('costs',{...records.costs.find(x=>x.id==='COST-02'),amount:Number(rate.amount)+Number(rate.destinationCharge),name:'Awarded freight including destination handling',status:'Confirmed'});log('Offer '+rate.id+' selected locally');notify('Offer selected. You can now prepare the booking draft.')}
 function fixPacking(){const r={...doc,version:Number(doc.version)+1,status:'Draft',content:'Packing list EXP-118 v'+(Number(doc.version)+1)+'\nPrecision valves PV-40: 400 units\n20 cartons × 20 units\nMatches SO-558. Draft correction prepared for review.'};update('documents',r);notify('Corrected draft prepared. Review it before approval.')}
 function action(collection,r){const m=modules.find(x=>x.id===collection);if(collection==='rates'){setModal({kind:'rate',record:r});return}if(collection==='rfqs'){openMission('import');setTab('Work products');return}if(collection==='invoices'){openMission('invoice');setModal(null);return}if(collection==='reports'){openModule('reports');setModal(null);return}if(collection==='admin'){notify('Connection is not configured. This prototype does not accept credentials.');return}const next={dashboard:'Resolved',partners:'Active',products:'Active',purchase:'Confirmed',sales:'Confirmed',planning:'Ready for booking',bookings:'Confirmed',tracking:r.status==='Exception'?'Resolved':'Confirmed',documents:'Approved',customs:'Released',costs:'Reconciled',portal:'Reviewed'}[collection]||m.statuses[Math.min(m.statuses.indexOf(r.status)+1,m.statuses.length-1)];if(collection==='documents'&&r.id==='DOC-04'&&r.status==='Needs correction'){notify('Resolve the packing list mismatch in the export mission first.');return}if(collection==='customs'&&records.documents.some(x=>x.reference==='SO-558'&&!['Approved','Final'].includes(x.status))){notify('Approve the export documents before recording release.');return}setModal({kind:'confirm',title:'Confirm record update',body:`Set ${r.id} to ${next}? This records a manual update in the sample workspace. It does not transmit a request or verify an external event.`,confirm:()=>{update(collection,{...r,status:next});if(collection==='bookings'&&r.reference==='PO-1042')update('shipments',{...records.shipments.find(x=>x.id==='IMP-204'),status:'Confirmed'});setModal(null);notify(`${r.id} updated to ${next}`)}})}
 const sources=type==='export'?['DOC-04','DOC-05']:['invoice','custom'].includes(type)?[]:['DOC-01','DOC-02','DOC-03'];
 const currentMessages=messages[missionId]||[];
 function contentIntro(){if(type==='export')return <><h3>A quantity mismatch needs your review.</h3><p>The packing list lists <strong>380 precision valves</strong>, while sales order SO-558 requires <strong>400</strong>. The commercial invoice agrees with the order.</p><p>Prepare a corrected packing list, review it, and approve the document before customs coordination.</p><div className="compare-mini"><span>Sales order<strong>400 units</strong></span><span>Packing list<strong>{doc.status==='Needs correction'?'380':'400'} units</strong></span><span>Difference<strong className={doc.status==='Needs correction'?'warn-text':''}>{doc.status==='Needs correction'?'20 units':'Matched'}</strong></span></div><div className="draft-box"><div className="row between"><h3>Packing list EXP-118</h3><Badge>{doc.status}</Badge></div><p>Version {doc.version} · Owner Vikram Shah</p><div className="actions">{doc.status==='Needs correction'?<Btn primary onClick={fixPacking}>Prepare corrected draft</Btn>:doc.status==='Draft'?<Btn primary onClick={()=>{update('documents',{...doc,status:'Approved'});notify('Packing list approved.')}}>Approve corrected document</Btn>:<span className="success-inline"><CheckCircle/>Document approved</span>}<Btn onClick={()=>detail('DOC-04')}>Review document</Btn></div></div></>;
 if(type==='invoice')return <><h3>The invoice includes an unapproved $240 surcharge.</h3><p>Invoice INV-091 from OceanBridge Logistics is <strong>{money(inv.amount)}</strong>. The recorded agreement for IMP-190 is <strong>{money(inv.expected)}</strong>.</p><div className="compare-mini"><span>Agreed<strong>{money(inv.expected)}</strong></span><span>Invoiced<strong>{money(inv.amount)}</strong></span><span>Variance<strong className="warn-text">+{money(inv.amount-inv.expected)}</strong></span></div><div className="draft-box"><div className="row between"><h3>Invoice decision</h3><Badge>{inv.status}</Badge></div><p>The sample invoice labels the difference as fuel surcharge. No approved amendment is attached.</p><div className="actions"><Btn primary disabled={inv.status==='Disputed'} onClick={()=>{update('invoices',{...inv,status:'Disputed'});approve('invoice');notify('Invoice disputed locally. Clarification draft is ready; no email sent.')}}>Dispute difference</Btn><Btn onClick={()=>setModal({kind:'confirm',title:'Approve invoice variance',body:'Approve the full USD 2,640 including the USD 240 variance? This records approval only; it does not make a payment.',confirm:()=>{update('invoices',{...inv,status:'Approved'});setModal(null);notify('Invoice approved locally. No payment made.')}})}>Approve with variance</Btn></div><p className="micro"><Info size={14}/> No payment or message will be sent.</p></div></>;
 if(type==='custom')return <><h3>Your mission workspace is ready.</h3><p>{mission.goal}</p><p>Select a work product below to add the relevant records. The demo assistant supports offer comparisons, document checks, invoice review, booking status and cost summaries.</p><div className="quick-prompts">{['Compare offers','Check documents','Show landed cost'].map(t=><Btn key={t} onClick={()=>setInput(t)}>{t}<ArrowRight/></Btn>)}</div></>;
 return <><h3>The plan is prepared. {ob.destinationCharge===''?'One charge needs clarification.':'Your freight offers are ready to compare.'}</h3><p>I’ve reviewed PO-1042, the supplier’s readiness email and <strong>3 freight offers</strong> for Shanghai to Chennai in this sample workspace.</p><p>{ob.destinationCharge===''?'Offer OB-082 excludes destination handling at Chennai. I’ve drafted a clarification to confirm the total and validity before you proceed.':'Destination handling has been recorded. Review the complete offers and select your preferred provider before creating a booking draft.'}</p><div className="offer-preview"><div className="row between"><h3>Freight offers <span>(Shanghai → Chennai)</span></h3><button className="text-btn" onClick={()=>setTab('Work products')}>Compare<ArrowRight size={14}/></button></div><table><thead><tr><th>Provider</th><th>Quoted cost</th><th>ETA Chennai</th></tr></thead><tbody>{records.rates.map((r,i)=><tr key={r.id} onClick={()=>setModal({kind:'rate',record:r})}><td><button className="table-link">{r.partner}</button><small>{r.name}</small></td><td><strong>{money(Number(r.amount)+Number(r.destinationCharge||0))}</strong>{r.destinationCharge===''&&<small className="warn-text">Destination charge excluded</small>}</td><td>{i===0?'27':i===1?'28':'29'} Sep 2026</td></tr>)}</tbody></table></div><div className="source-chips"><span>Sources</span>{sources.map(id=><button key={id} onClick={()=>detail(id)}><FileText size={16}/>{id==='DOC-01'?'PO-1042':id==='DOC-02'?'Supplier email':'Offer OB-082'}</button>)}</div><div className="draft-box"><div className="row between"><h3>Clarification draft</h3><Badge>{approvals.import?'Approved locally':'Awaiting your approval'}</Badge></div><p className="recipient">To: <strong>OceanBridge Logistics</strong> · sample partner</p><p className="draft-text">{draft}</p><div className="actions"><Btn primary disabled={!!approvals.import} onClick={()=>approve('import')}><Check size={17}/>{approvals.import?'Draft approved':'Approve draft'}</Btn><Btn onClick={()=>setModal({kind:'draft'})}>Edit</Btn>{approvals.import&&ob.destinationCharge===''&&<Btn onClick={()=>setModal({kind:'charge'})}>Record partner response</Btn>}</div><p className="micro"><Info size={14}/> No message sent. A connected email account is required to send.</p></div></>}

 return <div className={'app-shell '+(sidebarCollapsed?'sidebar-collapsed':'')}>
 <aside className={'sidebar '+(navOpen?'open':'')}>
  <div className="sidebar-header">
    <div className="sidebar-header-top">
      <div className="wordmark" onClick={()=>openMission('import')}>
        <img src="/harbor-mark.png" alt="" className="sidebar-brand-mark"/>
        <span>Harbor</span>
      </div>
      <button
        className="sidebar-toggle"
        type="button"
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={(e) => {
          e.stopPropagation();
          setSidebarCollapsed(v => !v);
        }}
      >
        <CaretLeft className="toggle-expanded-icon" size={17}/>
        <CaretRight className="toggle-collapsed-icon" size={17}/>
      </button>
    </div>
    <p className="sidebar-tagline">Global trade,<br/>more human.</p>
  </div>
  <Btn primary className="new-mission" title="New mission" onClick={()=>setModal({kind:'newmission'})}>
    <Plus size={21}/><span>New mission</span>
  </Btn>
  <div className="sidebar-scroll">{view==='records'&&<button className="back-to-missions" title="AI missions" onClick={()=>openMission(missionId)}><House size={19}/><span><strong>AI missions</strong><small>Return to your active work</small></span><CaretRight size={15}/></button>}{view==='mission'&&<><div className="section-label row between">Active missions<button className="icon-btn small" aria-label="Add mission" onClick={()=>setModal({kind:'newmission'})}><Plus size={17}/></button></div><nav className="mission-list">{missions.map(m=><button className={'mission-item '+(view==='mission'&&missionId===m.id?'selected':'')} key={m.id} title={m.name} onClick={()=>openMission(m.id)}><span className={'mission-dot '+(missionId===m.id?'blue':'')}/><span>{m.name}<small>{m.subtitle}</small></span></button>)}</nav></>}<div className="module-section-heading"><span>All modules</span><span className="count">20</span></div>
 <ModuleNavigation
  moduleId={moduleId}
  view={view}
  records={records}
  openModule={openModule}
  hasPermission={hasPermission}
/></div>
 <div className="sidebar-bottom"><button className="about-link" onClick={()=>setModal({kind:'about'})}><Info size={19}/><span>About Harbor</span></button>
 <button className="profile" onClick={()=>setModal({kind:'about'})}>
  <span className="avatar">
    {profile?.user?.name
      ?.split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'}
  </span>

  <span>
    {profile?.user?.name || 'User'}
    <small>
      {profile?.organization_roles?.[0]?.organization?.legal_name || 'Organization'}
    </small>
  </span>

  <CaretRight size={16}/>
</button>
 </div></aside>
 <main className={'workspace '+(view==='records'?'records-workspace':'')}><div className="mobile-top"><button className="icon-btn" aria-label="Open modules and missions navigation" onClick={()=>setNavOpen(!navOpen)}><List size={24}/></button><strong>Harbor</strong><button className="icon-btn mobile-search" aria-label="Search workspace" onClick={()=>setModal({kind:'search'})}><MagnifyingGlass size={21}/></button>{view==='mission'?<button className="text-btn" onClick={()=>setPlanOpen(!planOpen)}>Shipment plan</button>:<span className="mobile-context">All modules</span>}</div>
 {view==='mission'?<><header className="workspace-header"><div className="top-meta"><span className="demo-label" onClick={()=>setModal({kind:'about'})}>Sample workspace</span><div className="topbar-actions"><span>16 September 2026</span><button className="top-search" aria-label="Search workspace" onClick={()=>setModal({kind:'search'})}><MagnifyingGlass size={18}/><span>Search</span></button></div></div><h1>{mission.title}</h1><p className="subtitle">{mission.reference} · {type==='custom'?'New mission':type==='export'?'Required by 8 Oct':type==='invoice'?'Due 25 Sep':'Required by 30 Sep'} · <span>AI demo</span></p><div className="tabs" role="tablist" aria-label="Mission views">{['Conversation','Work products','Activity'].map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}{t==='Work products'&&<span className="tab-count">{type==='import'?4:type==='export'?3:2}</span>}</button>)}</div></header>
 <div className="conversation-scroll" ref={scroll}>{tab==='Conversation'?<><div className="message user-message"><span className="avatar small-avatar">AR</span><div>{mission.goal}</div><time>9:12 AM</time></div><div className="message assistant-message"><span className="assistant-avatar"><img src="/harbor-mark.png" alt="" className="harbor-mark"/></span><div className="assistant-content">{contentIntro()}</div></div>{currentMessages.map((m,i)=><div key={i} className={'message followup '+(m.role==='user'?'user-message':'assistant-message')}><span className={m.role==='user'?'avatar small-avatar':'assistant-avatar'}>{m.role==='user'?'AR':<img src="/harbor-mark.png" alt="" className="harbor-mark"/>}</span><div className="reply-text">{m.text}</div></div>)}{busy&&<p className="thinking">Reviewing the sample records…</p>}</>:tab==='Work products'?<WorkProducts type={type} records={records} selectedRate={selectedRate} award={award} createBooking={createBooking} importBooked={importBooked} openModule={openModule} detail={detail} setModal={setModal} fixPacking={fixPacking}/>:<div className="activity"><h2>Mission activity</h2><p className="muted">Local changes and decisions in this demo session.</p>{audit.length?audit.map(a=><div className="activity-row" key={a.id}><CheckCircle size={20}/><div>{a.text}<small>{a.time} · Ananya Rao</small></div></div>):<div className="empty"><Clock size={30}/><h3>No changes yet</h3><p>Approvals, edits and new records will appear here.</p></div>}</div>}</div>
 <form className="composer" onSubmit={ask}><div className="compose-line"><button type="button" className="icon-btn" aria-label="Attach a document" onClick={()=>fileRef.current.click()}><Paperclip size={23}/></button><textarea aria-label="Message Harbor" rows={2} placeholder="Ask Harbor, change the plan, or attach a document…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}}/><button className="send" type="submit" aria-label="Send message" disabled={!input.trim()||busy}><ArrowUp size={23}/></button></div><div className="compose-context"><span>{mission.reference}</span>{attachments.map((n,i)=><button key={i} type="button" onClick={()=>setAttachments(a=>a.filter((_,j)=>i!==j))}>{n}<X size={13}/></button>)}<small>Demo assistant · review before acting</small></div><input ref={fileRef} type="file" hidden multiple onChange={e=>{setAttachments(a=>[...a,...Array.from(e.target.files).map(f=>f.name)]);notify('Attached locally for this draft. File content is not uploaded or analyzed.');e.target.value=''}}/></form>
      </>:<><header className="records-header"><div className="records-meta-row"><div className="eyebrow">YOUR WORKSPACE / RECORDS</div><button className="top-search" aria-label="Search workspace" onClick={()=>setModal({kind:'search'})}><MagnifyingGlass size={18}/><span>Search</span></button></div>{moduleId!=='customers'&&moduleId!=='organization'&&moduleId!=='vendors'&&moduleId!=='branches'&&moduleId!=='agents'&&moduleId!=='ports'&&moduleId!=='cfs'&&moduleId!=='drivers'&&moduleId!=='load_board'&&moduleId!=='quotes'&&moduleId!=='rates'&&moduleId!=='fleet'&&moduleId!=='carrier_fleet'&&moduleId!=='admin'&&moduleId!=='bookings'&&( <div className="row between"><div><h1>{mod.name}</h1><p className="muted">{mod.description}</p></div>{moduleId!=='users'&&moduleId!=='roles'&&<Btn primary onClick={()=>setModal({kind:'form',collection:moduleId})}><Plus size={18}/>New record</Btn>}</div>)}</header><div className="records-body">{moduleId==='dashboard'&&<Dashboard records={records} openModule={openModule} openMission={openMission}/>} {moduleId==='reports'&&<Reports records={records}/>} {moduleId==='costs'&&<CostCalculator records={records}/>} {moduleId==='admin'&&<SettingsRegistry hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name} currentOrg={profile?.organization_roles?.[0]?.organization} settings={settings} setSettings={setSettings} settingAudit={settingAudit} setSettingAudit={setSettingAudit} visible={view==='records'&&moduleId==='admin'}/>} {moduleId==='users'&&<UserManagement hasPermission={hasPermission} notify={notify} currentUser={profile?.user}/>} {moduleId==='roles'&&<RolePermissionMaster hasPermission={hasPermission} notify={notify} currentRoleName={role?.name}/>} {moduleId==='organization'&&<OrganizationView hasPermission={hasPermission} notify={notify} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='customers'&&<CustomerMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading}/>} {moduleId==='vendors'&&<VendorMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user}/>} {moduleId==='branches'&&<BranchMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='agents'&&<AgentMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='ports'&&<PortMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='cfs'&&<CfsMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='drivers'&&<DriverMaster hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name}/>} {moduleId==='load_board'&&<LoadBoard hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name} currentOrg={profile?.organization_roles?.[0]?.organization}/>} {(moduleId==='quotes'||moduleId==='rates')&&<QuoteRateManagement hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name} currentOrg={profile?.organization_roles?.[0]?.organization}/>} {(moduleId==='fleet'||moduleId==='carrier_fleet')&&<CarrierFleetManagement hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name} currentOrg={profile?.organization_roles?.[0]?.organization}/>} {moduleId==='bookings'&&<BookingManagement hasPermission={hasPermission} notify={notify} profileLoading={profileLoading} currentUser={profile?.user} currentRoleName={role?.name} currentOrg={profile?.organization_roles?.[0]?.organization} initialRecords={records.bookings}/>}
{moduleId!=='users'&&moduleId!=='roles'&&moduleId!=='organization'&&moduleId!=='customers'&&moduleId!=='vendors'&&moduleId!=='branches'&&moduleId!=='agents'&&moduleId!=='ports'&&moduleId!=='cfs'&&moduleId!=='drivers'&&moduleId!=='load_board'&&moduleId!=='quotes'&&moduleId!=='rates'&&moduleId!=='fleet'&&moduleId!=='carrier_fleet'&&moduleId!=='admin'&&moduleId!=='bookings'&&(
<>
<div className="table-toolbar"><div className="search-input"><MagnifyingGlass size={19}/><input aria-label="Search records" placeholder="Search records…" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}><option>All statuses</option>{mod.statuses.map(s=><option key={s}>{s}</option>)}</select><button className="icon-btn" aria-label="Export records as CSV" title="Export CSV" onClick={exportCsv}><DownloadSimple size={21}/></button></div><div className="table-wrap"><table className="records-table"><thead><tr><th>Reference</th>{mod.fields.slice(0,5).filter(k=>k!=='status').map(k=><th key={k}>{labels[k]||k}</th>)}<th>Status</th><th></th></tr></thead><tbody>{records[moduleId]?.filter(r=>(filter==='All statuses'||r.status===filter)&&Object.values(r).join(' ').toLowerCase().includes(query.toLowerCase())).map(r=><tr key={r.id}><td><button className="table-link" onClick={()=>detail(r.id,moduleId)}>{r.id}</button></td>{mod.fields.slice(0,5).filter(k=>k!=='status').map(k=><td key={k}>{display(k,r[k])}</td>)}<td><Badge>{r.status}</Badge></td><td><button className="icon-btn small" aria-label={'Open '+r.id} onClick={()=>detail(r.id,moduleId)}><CaretRight size={18}/></button></td></tr>)}</tbody></table></div>{!records[moduleId]?.some(r=>(filter==='All statuses'||r.status===filter)&&Object.values(r).join(' ').toLowerCase().includes(query.toLowerCase()))&&<div className="empty"><MagnifyingGlass size={30}/><h3>No matching records</h3><p>Change your search or create a record.</p></div>}<div className="table-footer">{records[moduleId]?.length || 0} records · Illustrative data · USD unless noted</div>
</>
)}
</div></>}
 </main>
 {view==='mission'&&<aside className={'plan-panel '+(planOpen?'mobile-open':'')}><div className="plan-heading"><FileText size={25}/><h2>{type==='custom'?'Mission plan':type==='invoice'?'Invoice review':type==='export'?'Export plan':'Shipment plan'}</h2><Badge>{importBooked&&type==='import'?importBooked.status:'Draft'}</Badge><button className="icon-btn mobile-close" aria-label="Close plan" onClick={()=>setPlanOpen(false)}><X/></button></div><p className="plan-subtitle">{type==='custom'?'Custom workspace':type==='export'?'Nhava Sheva → Hamburg':type==='invoice'?'OceanBridge Logistics':'Shanghai → Chennai'} · {mission.reference}</p><div className="steps">{(type==='custom'?[['Define the mission','Goal recorded','done'],['Add source records','Open Work products','active'],['Review prepared work','Requires your input','pending'],['Approve next action','No external actions connected','pending']]:type==='export'?[['Read sales order','Completed · SO-558','done'],['Check export documents',doc.status==='Needs correction'?'20-unit mismatch':'Quantities matched',doc.status==='Needs correction'?'active':'done'],['Approve packing list',doc.status==='Approved'?'Document approved':'Needs your review',doc.status==='Approved'?'done':'active'],['Coordinate clearance','Broker documents required','pending']]:type==='invoice'?[['Read freight agreement','Completed · USD 2,400','done'],['Match invoice charges','USD 240 variance identified','done'],['Review variance',inv.status,inv.status==='Under review'?'active':'done'],['Financial settlement','Accounting not connected','pending']]:[['Read order and supplier confirmation','Completed · 2 source docs','done'],['Compare freight offers',selectedRate?'Offer selected':'Completed · 3 offers','done'],['Clarify destination charges',ob.destinationCharge===''?(approvals.import?'Draft approved locally':'Needs your approval'):'Charge recorded',ob.destinationCharge===''?'active':'done'],['Prepare booking request',importBooked?importBooked.id+' · '+importBooked.status:'Complete offer must be selected',importBooked?'done':'pending']]).map(([title,sub,status],i)=><button className={'step '+status} key={title} onClick={()=>{if(type==='custom'){setTab('Work products');return}if(i===0){sources[0]?detail(sources[0]):detail('INV-091')}else if(i===1)setTab('Work products');else if(i===2)setTab('Conversation');else type==='import'?createBooking():openModule(type==='export'?'customs':'invoices')}}><span className="step-marker">{status==='done'?<Check size={17}/>:status==='active'?<span/>:null}</span><span><strong>{title}</strong><small>{sub}</small></span></button>)}</div><div className="plan-details"><h3>{type==='custom'?'Mission details':type==='invoice'?'Invoice details':'Shipment details'}</h3><dl>{(type==='custom'?[['Reference',mission.reference],['Owner','Ananya Rao'],['Mode','Sample workspace']]:type==='invoice'?[['Invoice',inv.id],['Agreed',money(inv.expected)],['Invoiced',money(inv.amount)],['Due date','25 Sep 2026']]:[['Origin',type==='export'?'Nhava Sheva, India':'Shanghai, China'],['Destination',type==='export'?'Hamburg, Germany':'Chennai, India'],['Cargo',type==='export'?'400 precision valves':'600 control units'],['Cargo ready',type==='export'?'20 Sep 2026':'18 Sep 2026'],['Required by',type==='export'?'8 Oct 2026':'30 Sep 2026']]).map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></div><div className="evidence"><h3>Evidence</h3>{sources.map(id=>{const r=records.documents.find(x=>x.id===id);return <button key={id} onClick={()=>detail(id)}><span className="file-icon"><FileText size={22}/></span><span>{r.name}<small>{r.type} · Version {r.version}</small></span><ArrowSquareOut size={15}/></button>})}{type==='custom'&&<p className="muted">Add relevant records from Work products to start your review.</p>}{type==='invoice'&&<button onClick={()=>detail(inv.id,'invoices')}><FileText size={23}/><span>Invoice {inv.id}<small>Sample supplier invoice</small></span></button>}</div><div className="plan-bottom"><ShieldCheck size={17}/><span>You approve. Harbor prepares.</span></div></aside>}
 {toast&&<div className="toast" role="status"><CheckCircle size={21}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={17}/></button></div>}
 {modal?.kind==='form'&&<RecordForm module={modules.find(m=>m.id===modal.collection)} record={modal.record} onClose={()=>setModal(null)} onSave={r=>{update(modal.collection,r);setModal(null);notify('Record saved in this sample workspace.')}}/>}
 {modal?.kind==='detail'&&<Modal title={modal.record.id} onClose={()=>setModal(null)}><div className="detail-title"><h2>{modal.record.name||modal.record.title}</h2><Badge>{modal.record.status}</Badge></div><dl className="detail-grid">{Object.entries(modal.record).filter(([k])=>!['id','name','title','status','content'].includes(k)).map(([k,v])=><React.Fragment key={k}><dt>{labels[k]||k}</dt><dd>{display(k,v)}</dd></React.Fragment>)}</dl>{modal.record.content&&<pre className="document-text">{modal.record.content}</pre>}<div className="modal-actions"><Btn onClick={()=>setModal({kind:'form',collection:modal.collection,record:modal.record})}><NotePencil size={18}/>Edit record</Btn>{modal.collection==='documents'&&<Btn onClick={()=>download(modal.record.name+'.txt',modal.record.content||Object.entries(modal.record).map(([k,v])=>k+': '+v).join('\n'))}><DownloadSimple size={18}/>Download</Btn>}<Btn primary onClick={()=>action(modal.collection,modal.record)}>{modules.find(m=>m.id===modal.collection).action}</Btn></div></Modal>}
 {modal?.kind==='draft'&&<DraftEditor draft={draft} onClose={()=>setModal(null)} onSave={v=>{setDraft(v);setApprovals(a=>({...a,import:false}));log('Clarification draft edited; approval reset');setModal(null);notify('Draft updated. Review it again before approval.')}}/>}
 {modal?.kind==='charge'&&<ChargeForm onClose={()=>setModal(null)} onSave={(amount,source)=>{update('rates',{...ob,destinationCharge:amount,status:'Valid'});update('portal',{...records.portal.find(x=>x.id==='REQ-032'),status:'Received'});log('Manual charge confirmation: '+money(amount)+' · '+source);setModal(null);notify('Destination charge recorded. Review offers under Work products.')}}/>}
 {modal?.kind==='confirm'&&<Modal title={modal.title} onClose={()=>setModal(null)}><p>{modal.body}</p><div className="modal-actions"><Btn onClick={()=>setModal(null)}>Cancel</Btn><Btn primary onClick={modal.confirm}>Confirm</Btn></div></Modal>}
 {modal?.kind==='newmission'&&<NewMission onClose={()=>setModal(null)} onSave={m=>{setMissions(a=>[...a,m]);setMissionId(m.id);setView('mission');setTab('Conversation');setModal(null);log('Mission created: '+m.name)}}/>}
 {modal?.kind==='modules'&&<Modal title="All workspaces" wide onClose={()=>setModal(null)}><p className="muted">Twenty connected modules. Open a workspace to inspect and edit records.</p><div className="module-grid">{modules.map(m=>{const Icon=icons[m.icon]||SquaresFour;return <button key={m.id} onClick={()=>{openModule(m.id);setModal(null)}}><Icon size={24}/><span><strong>{m.name}</strong><small>{m.group} · {records[m.id]?.length ?? 0} records</small></span><CaretRight size={17}/></button>})}</div></Modal>}
 {modal?.kind==='search'&&<Search records={records} onClose={()=>setModal(null)} detail={detail}/>}
 {modal?.kind==='rate'&&<Modal title={modal.record.id+' · Freight offer'} onClose={()=>setModal(null)}><h2>{modal.record.partner}</h2><p>{modal.record.origin} → {modal.record.destination}</p><dl className="detail-grid"><dt>Origin and ocean</dt><dd>{money(modal.record.amount)}</dd><dt>Destination handling</dt><dd>{display('destinationCharge',modal.record.destinationCharge)}</dd><dt>{modal.record.destinationCharge===''?'Known charges':'Quoted total'}</dt><dd><strong>{money(Number(modal.record.amount)+Number(modal.record.destinationCharge||0))}</strong></dd><dt>Valid until</dt><dd>{display('validUntil',modal.record.validUntil)}</dd></dl>{modal.record.destinationCharge===''&&<p className="notice"><WarningCircle/>Total is incomplete. Destination handling must be confirmed.</p>}<div className="modal-actions"><Btn onClick={()=>setModal({kind:'form',collection:'rates',record:modal.record})}>Edit offer</Btn><Btn primary disabled={modal.record.destinationCharge===''} onClick={()=>{award(modal.record);setModal(null)}}>Select this offer</Btn></div></Modal>}
 {modal?.kind==='about'&&<Modal title="Your Harbor workspace" onClose={()=>setModal(null)}><p className="lead">AI conversation, connected work products, and decisions you control.</p><p>This interactive frontend includes all 20 module workspaces with sample records, editable forms, search, filters and CSV exports.</p><div className="notice"><Info/><p>AI replies are scripted demonstrations. Carrier bookings, emails, customs filings and payments are not transmitted. Changes are kept only for this browser session.</p></div>
 
 <p>
  Current profile: {profile?.user?.name || 'User'} ·{' '}
  {profile?.organization_roles?.[0]?.organization?.legal_name || 'Organization'}
  {' · '}
  {profile?.organization_roles?.[0]?.role?.name || 'User'}
</p>

 <div className="modal-actions"><Btn onClick={onLogout}><SignOut size={18}/>Log out</Btn><Btn primary onClick={()=>{setModal({kind:'modules'})}}>Explore all modules</Btn></div></Modal>}
 </div>
}

function DraftEditor({draft,onSave,onClose}){const [text,setText]=useState(draft);return <Modal title="Edit clarification draft" onClose={onClose}><label>Message to OceanBridge Logistics<textarea className="large-textarea" value={text} onChange={e=>setText(e.target.value)}/></label><p className="muted">Saving an edit resets the approval. No email will be sent.</p><div className="modal-actions"><Btn onClick={onClose}>Cancel</Btn><Btn primary disabled={!text.trim()} onClick={()=>onSave(text)}>Save draft</Btn></div></Modal>}
function ChargeForm({onSave,onClose}){const [v,setV]=useState(''),[source,setSource]=useState('');return <Modal title="Record partner response" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave(Number(v),source)}}><p>Add a manually confirmed charge and evidence reference. This updates the sample offer.</p><label>Destination handling in USD<input required type="number" min="0" step="0.01" value={v} onChange={e=>setV(e.target.value)}/></label><label>Source or confirmation reference<input required placeholder="e.g. Partner email dated 16 September" value={source} onChange={e=>setSource(e.target.value)}/></label><div className="modal-actions"><Btn primary type="submit">Save confirmation</Btn></div></form></Modal>}
function NewMission({onClose,onSave}){const [goal,setGoal]=useState(''),[name,setName]=useState(''),[ref,setRef]=useState('');return <Modal title="Start a new mission" onClose={onClose}><form onSubmit={e=>{e.preventDefault();onSave({id:uid('mission'),name,title:name,goal,reference:ref||'New mission',subtitle:ref||'Custom workspace',type:'custom'})}}><p className="muted">Describe the outcome. You can attach records and review work products as you go.</p><label>Mission name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. October control unit import"/></label><label>What would you like to achieve?<textarea required className="large-textarea" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Plan the shipment and check the required documents…"/></label><label>Order or shipment reference<input value={ref} onChange={e=>setRef(e.target.value)} placeholder="PO-1048"/></label><div className="modal-actions"><Btn onClick={onClose} type="button">Cancel</Btn><Btn primary type="submit">Create mission<ArrowRight/></Btn></div></form></Modal>}
function Search({records,onClose,detail}){const [q,setQ]=useState('');const results=q.trim()?Object.entries(records).flatMap(([c,rows])=>rows.filter(r=>Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase())).map(r=>({c,r}))).slice(0,15):[];return <Modal title="Search your workspace" onClose={onClose}><div className="search-input"><MagnifyingGlass/><input autoFocus placeholder="Search orders, shipments, documents…" value={q} onChange={e=>setQ(e.target.value)}/></div><div className="search-results">{results.map(({c,r})=><button key={c+r.id} onClick={()=>detail(r.id,c)}><FileText size={22}/><span><strong>{r.id} · {r.name||r.title}</strong><small>{modules.find(m=>m.id===c).name}</small></span><CaretRight/></button>)}{q&&!results.length&&<p className="muted">No records match “{q}”.</p>}</div></Modal>}
function WorkProducts({type,records,selectedRate,award,createBooking,importBooked,openModule,detail,fixPacking}){return <div className="work-products"><div className="eyebrow">PREPARED FOR YOUR REVIEW</div><h2>{type==='export'?'Export readiness':type==='invoice'?'Invoice reconciliation':type==='custom'?'Connected workspaces':'Compare freight offers'}</h2><p className="muted">Source records stay linked to each decision. All values are illustrative.</p>{type==='import'?<><div className="offer-cards">{records.rates.map((r,i)=><article key={r.id} className={'rate-card '+(selectedRate===r.id?'chosen':'')}><div className="row between"><Tag size={22}/><Badge>{r.destinationCharge===''?'Incomplete':selectedRate===r.id?'Selected':'Complete'}</Badge></div><h3>{r.partner}</h3><p>{r.name}</p><div className="rate-amount">{money(Number(r.amount)+Number(r.destinationCharge||0))}</div><small>{r.destinationCharge===''?'Known charges only':'Complete quoted total'}</small><dl><dt>Origin and ocean</dt><dd>{money(r.amount)}</dd><dt>Destination</dt><dd>{r.destinationCharge===''?'Missing':money(r.destinationCharge)}</dd><dt>Arrival</dt><dd>{i===0?'27':i===1?'28':'29'} Sep</dd></dl><Btn primary={selectedRate===r.id} disabled={r.destinationCharge===''} onClick={()=>award(r)}>{selectedRate===r.id?'Selected offer':'Select offer'}</Btn></article>)}</div><div className="work-row"><div><h3>Booking request</h3><p>{importBooked?`${importBooked.id} · ${importBooked.status}`:'Select a complete offer to prepare a booking draft.'}</p></div><Btn primary disabled={!selectedRate} onClick={createBooking}>{importBooked?'Open booking':'Prepare booking'}<ArrowRight/></Btn></div><div className="work-row"><div><h3>Order and supplier readiness</h3><p>600 control units · Ready 18 September</p></div><Btn onClick={()=>detail('PO-1042')}>View order</Btn></div><div className="work-row"><div><h3>Landed cost worksheet</h3><p>Track known charges and product allocation.</p></div><Btn onClick={()=>openModule('costs')}>Review costs</Btn></div></>:type==='export'?<>{records.documents.filter(r=>r.reference==='SO-558').map(r=><div className="work-row" key={r.id}><FileText size={24}/><div><h3>{r.name}</h3><p>Version {r.version} · {r.status}</p></div><Btn onClick={()=>detail(r.id)}>Review</Btn></div>)}<div className="work-row"><div><h3>Customs coordination</h3><p>Broker checklist and clearance status.</p></div><Btn onClick={()=>openModule('customs')}>Open checklist</Btn></div></>:type==='invoice'?<>{records.invoices.map(r=><div className="work-row" key={r.id}><Receipt size={25}/><div><h3>{r.id} · {money(r.amount)}</h3><p>{money(r.amount-r.expected)} variance · {r.status}</p></div><Btn onClick={()=>detail(r.id)}>Open invoice</Btn></div>)}<div className="work-row"><div><h3>Supporting shipment</h3><p>IMP-190 · August components</p></div><Btn onClick={()=>detail('IMP-190')}>View shipment</Btn></div></>:<div className="module-grid">{modules.map(m=>{const Icon=icons[m.icon];return <button key={m.id} onClick={()=>openModule(m.id)}><Icon size={24}/><span>{m.name}</span><CaretRight/></button>})}</div>}</div>}
function Dashboard({records,openModule,openMission}){return <div className="dashboard-summary"><h2>Your attention makes the difference.</h2><p className="muted">Three sample journeys connect the operational work.</p><div className="mission-cards">{[['import','Shanghai import','Clarify the excluded destination charge.',Boat],['export','September exports','Resolve a packing list quantity mismatch.',Files],['invoice','Invoice review','Review a USD 240 invoice variance.',Receipt]].map(([id,title,desc,Icon])=><button key={id} onClick={()=>openMission(id)}><Icon size={27}/><h3>{title}</h3><p>{desc}</p><span>Open mission<ArrowRight/></span></button>)}</div></div>}
function Reports({records}){const total=records.shipments.length,delivered=records.shipments.filter(r=>['Delivered','Closed'].includes(r.status)).length;const invTotal=records.invoices.reduce((s,r)=>s+Number(r.amount),0),variance=records.invoices.reduce((s,r)=>s+Number(r.amount)-Number(r.expected),0);return <div className="report-panel"><div className="report-stats"><div><span>Shipments</span><strong>{total}</strong><small>{delivered} delivered or closed</small></div><div><span>Supplier invoices</span><strong>{money(invTotal)}</strong><small>{records.invoices.length} invoices · all statuses</small></div><div><span>Invoice variance</span><strong>{money(variance)}</strong><small>Invoiced minus agreed</small></div></div><h3>Shipment status</h3>{['Planned','Confirmed','In transit','Delivered','Closed'].map(s=>{const n=records.shipments.filter(r=>r.status===s).length;return <div className="bar-row" key={s}><span>{s}</span><meter min="0" max={Math.max(total,1)} value={n}/><strong>{n}</strong></div>})}<p className="micro">Calculated from current sample records. No market benchmarks or predictive estimates.</p></div>}
function CostCalculator({records}){const [qty,setQty]=useState(600),[extra,setExtra]=useState(0);const base=records.costs.filter(r=>r.reference==='IMP-204').reduce((s,r)=>s+Number(r.amount||0),0);const total=base+Number(extra);return <div className="cost-calculator"><div><h2>IMP-204 cost worksheet</h2><p className="muted">Known estimates allocated equally by unit. Duties, taxes and delivery may be additional.</p><div className="calc-inputs"><label>Units<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Additional estimate (USD)<input type="number" min="0" step="0.01" value={extra} onChange={e=>setExtra(e.target.value)}/></label></div></div><div className="calc-result"><span>Estimated total</span><strong>{money(total)}</strong><span>{Number(qty)>0?money(total/Number(qty))+' per unit':'Enter a positive quantity'}</span></div></div>}
