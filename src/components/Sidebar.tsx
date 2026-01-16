import React, {useState} from 'react'

export default function Sidebar({onNavigate}:{onNavigate:(v:'factory'|'shift'|'timeline')=>void}){
  const [collapsed, setCollapsed] = useState(false)

  const asideStyle: React.CSSProperties = {
    width: collapsed ? 56 : 220,
    background: '#0b1114',
    padding: 12,
    color: '#cde8e1',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 160ms ease'
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    margin: '6px 0',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer'
  }

  const iconOnly = (icon:string) => (
    <span style={{fontSize:18,display:'inline-block',width:28,textAlign:'center'}}>{icon}</span>
  )

  return (
    <aside style={asideStyle} aria-expanded={!collapsed}>
      <div style={{display:'flex',alignItems:'center',justifyContent: collapsed ? 'center' : 'space-between'}}>
        {!collapsed && <h3 style={{margin:'8px 0'}}>Central PI</h3>}
        <button aria-label={collapsed ? 'Show nav' : 'Hide nav'} onClick={()=>setCollapsed(!collapsed)} style={{background:'transparent',border:'none',color:'inherit',cursor:'pointer'}}>
          {collapsed ? '›' : '✖'}
        </button>
      </div>

      <nav style={{marginTop:12,display:'flex',flexDirection:'column'}}>
        <button style={btnStyle} onClick={()=>onNavigate('shift')}>
          {collapsed ? iconOnly('≡') : <><span style={{width:24}}>≡</span><span>Shift View</span></>}
        </button>
        <button style={btnStyle} onClick={()=>onNavigate('factory')}>
          {collapsed ? iconOnly('○') : <><span style={{width:24}}>○</span><span>Factory Overview</span></>}
        </button>
        <button style={btnStyle} onClick={()=>onNavigate('timeline')}>
          {collapsed ? iconOnly('▦') : <><span style={{width:24}}>▦</span><span>Timeline View</span></>}
        </button>
      </nav>

      <div style={{flex:1}} />

      {!collapsed && <div className="muted" style={{fontSize:12}}>Logged in</div>}
    </aside>
  )
}

