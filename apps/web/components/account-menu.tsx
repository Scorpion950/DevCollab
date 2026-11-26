"use client";
import { useRef, useState } from "react";
import { ChevronDown, LogOut, SunMoon } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { useWorkspaceTheme } from "./workspace-theme/workspace-theme";

export function AccountMenu({name,email,image}:{name:string;email:string;image:string|null}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [failed,setFailed] = useState(false);
  const {theme,toggleTheme}=useWorkspaceTheme();
  return <details className="account-menu" ref={menu} onKeyDown={event=>{
    if(event.key==="Escape" && menu.current){menu.current.open=false;menu.current.querySelector("summary")?.focus();}
  }}><summary aria-label="Account options"><span className="avatar">{image && !failed ?
    // Provider avatars can come from multiple external origins.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : name.slice(0,1).toUpperCase()}</span>
    <span>{name}</span><ChevronDown size={16}/></summary>
    <div className="account-options"><strong>{name}</strong><p>{email}</p><button onClick={toggleTheme}><SunMoon size={16}/>Use {theme==="dark"?"light":"dark"} theme</button>
    <form action={logout}><button><LogOut size={16}/>Sign out</button></form></div></details>;
}
