"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, CircleAlert } from "lucide-react";
import { Button } from "./ui/button";
import { startOAuth, submitAuth } from "@/app/auth/actions";

function PasswordField({ confirm=false, signup }: { confirm?:boolean; signup:boolean }) {
  const [visible,setVisible]=useState(false);
  const label = confirm ? "Confirm password" : "Password";
  const id = confirm ? "confirm" : "password";
  return <div className="access-field"><label htmlFor={id}>{label}</label><div className="access-password">
    <input id={id} name={id} type={visible?"text":"password"} required minLength={signup?12:undefined} maxLength={128}
      autoComplete={signup?"new-password":"current-password"} aria-describedby={signup?"password-policy":undefined}/>
    <button type="button" aria-label={(visible?"Hide ":"Show ")+label.toLowerCase()} aria-pressed={visible} onClick={()=>setVisible(!visible)}>
      {visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>;
}

function ProviderButton({ provider, enabled }: { provider:string; enabled:boolean }) {
  const {pending}=useFormStatus();
  return <Button variant="secondary" disabled={!enabled || pending}>
    {pending?"Connecting…":(enabled?"Continue with "+provider:provider+" · Not configured")}
  </Button>;
}

export function AuthPanel({signup=false,settings,initialMessage=""}:{
  signup?:boolean; settings:{ready:boolean;google:boolean;github:boolean}; initialMessage?:string;
}) {
  const [state, action, pending] = useActionState(submitAuth.bind(null,signup),{message:"",email:"",name:""});
  const message = state.message || initialMessage;
  return <section className="access-form" aria-labelledby="access-title">
    <h1 id="access-title">{signup?"Create an account.":"Welcome back."}</h1>
    <p className="access-lede">{signup?"Set up your DevCollab workspace identity.":"Sign in to your engineering workspace."}</p>
    {!settings.ready && <p className="access-notice">Account access is unavailable until the database and authentication secret are configured.</p>}
    <form action={action} aria-busy={pending}>
      {signup&&<label className="access-field">Full name<input type="text" name="name" defaultValue={state.name} required maxLength={100} autoComplete="name"/></label>}
      <label className="access-field">Email address<input type="email" name="email" defaultValue={state.email} required maxLength={254} autoComplete="email" placeholder="you@example.com"/></label>
      <PasswordField signup={signup}/>
      {signup&&<><p id="password-policy" className="form-hint">Use 12–128 characters.</p><PasswordField confirm signup/></>}
      <div aria-live="polite">{message&&<p className="form-error"><CircleAlert size={16}/>{message}</p>}</div>
      <Button disabled={!settings.ready || pending}>{pending?(signup?"Creating account…":"Signing in…"):(signup?"Create Account":"Sign In")}</Button>
    </form><div className="access-divider">or</div>
    <div className="access-providers">{(["google","github"] as const).map(provider=><form key={provider} action={startOAuth.bind(null,provider)}>
      <ProviderButton provider={provider==="google"?"Google":"GitHub"} enabled={settings[provider]}/></form>)}</div>
    <p className="access-switch">{signup?"Already have an account?":"Don't have an account?"} <Link href={signup?"/auth/sign-in":"/auth/sign-up"}>{signup?"Sign In":"Sign Up"}</Link></p>
  </section>;
}
