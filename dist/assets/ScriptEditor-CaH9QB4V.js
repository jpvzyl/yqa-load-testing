import{r as o,W as q,n as Ee,u as Me,c as Y,j as i,L as X,o as Pe,Z as G}from"./index-c68GaVon.js";import{m as ee}from"./proxy-B6sTRO0-.js";import{C as Re}from"./chevron-down-C5IdqlTi.js";import{C as ue}from"./circle-check-J3hY2rY5.js";import{C as le}from"./circle-alert-7PNFwICT.js";import{S as _e}from"./save-CgfZsCYM.js";import{P as Ce}from"./play-D1hTsvod.js";function de(e,t){(t==null||t>e.length)&&(t=e.length);for(var r=0,n=Array(t);r<t;r++)n[r]=e[r];return n}function Te(e){if(Array.isArray(e))return e}function Le(e,t,r){return(t=Ve(t))in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function ke(e,t){var r=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(r!=null){var n,a,s,f,h=[],g=!0,v=!1;try{if(s=(r=r.call(e)).next,t!==0)for(;!(g=(n=s.call(r)).done)&&(h.push(n.value),h.length!==t);g=!0);}catch(P){v=!0,a=P}finally{try{if(!g&&r.return!=null&&(f=r.return(),Object(f)!==f))return}finally{if(v)throw a}}return h}}function Ae(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function fe(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(a){return Object.getOwnPropertyDescriptor(e,a).enumerable})),r.push.apply(r,n)}return r}function pe(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?fe(Object(r),!0).forEach(function(n){Le(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):fe(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function Ie(e,t){if(e==null)return{};var r,n,a=$e(e,t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(e);for(n=0;n<s.length;n++)r=s[n],t.indexOf(r)===-1&&{}.propertyIsEnumerable.call(e,r)&&(a[r]=e[r])}return a}function $e(e,t){if(e==null)return{};var r={};for(var n in e)if({}.hasOwnProperty.call(e,n)){if(t.indexOf(n)!==-1)continue;r[n]=e[n]}return r}function Ue(e,t){return Te(e)||ke(e,t)||qe(e,t)||Ae()}function De(e,t){if(typeof e!="object"||!e)return e;var r=e[Symbol.toPrimitive];if(r!==void 0){var n=r.call(e,t);if(typeof n!="object")return n;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function Ve(e){var t=De(e,"string");return typeof t=="symbol"?t:t+""}function qe(e,t){if(e){if(typeof e=="string")return de(e,t);var r={}.toString.call(e).slice(8,-1);return r==="Object"&&e.constructor&&(r=e.constructor.name),r==="Map"||r==="Set"?Array.from(e):r==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?de(e,t):void 0}}function Fe(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function me(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(a){return Object.getOwnPropertyDescriptor(e,a).enumerable})),r.push.apply(r,n)}return r}function he(e){for(var t=1;t<arguments.length;t++){var r=arguments[t]!=null?arguments[t]:{};t%2?me(Object(r),!0).forEach(function(n){Fe(e,n,r[n])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):me(Object(r)).forEach(function(n){Object.defineProperty(e,n,Object.getOwnPropertyDescriptor(r,n))})}return e}function ze(){for(var e=arguments.length,t=new Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(n){return t.reduceRight(function(a,s){return s(a)},n)}}function H(e){return function t(){for(var r=this,n=arguments.length,a=new Array(n),s=0;s<n;s++)a[s]=arguments[s];return a.length>=e.length?e.apply(this,a):function(){for(var f=arguments.length,h=new Array(f),g=0;g<f;g++)h[g]=arguments[g];return t.apply(r,[].concat(a,h))}}}function ne(e){return{}.toString.call(e).includes("Object")}function Be(e){return!Object.keys(e).length}function K(e){return typeof e=="function"}function We(e,t){return Object.prototype.hasOwnProperty.call(e,t)}function Ge(e,t){return ne(t)||L("changeType"),Object.keys(t).some(function(r){return!We(e,r)})&&L("changeField"),t}function He(e){K(e)||L("selectorType")}function Je(e){K(e)||ne(e)||L("handlerType"),ne(e)&&Object.values(e).some(function(t){return!K(t)})&&L("handlersType")}function Ke(e){e||L("initialIsRequired"),ne(e)||L("initialType"),Be(e)&&L("initialContent")}function Ze(e,t){throw new Error(e[t]||e.default)}var Qe={initialIsRequired:"initial state is required",initialType:"initial state should be an object",initialContent:"initial state shouldn't be an empty object",handlerType:"handler should be an object or a function",handlersType:"all handlers should be a functions",selectorType:"selector should be a function",changeType:"provided value of changes should be an object",changeField:'it seams you want to change a field in the state which is not specified in the "initial" state',default:"an unknown error accured in `state-local` package"},L=H(Ze)(Qe),te={changes:Ge,selector:He,handler:Je,initial:Ke};function Ye(e){var t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{};te.initial(e),te.handler(t);var r={current:e},n=H(tt)(r,t),a=H(et)(r),s=H(te.changes)(e),f=H(Xe)(r);function h(){var v=arguments.length>0&&arguments[0]!==void 0?arguments[0]:function(P){return P};return te.selector(v),v(r.current)}function g(v){ze(n,a,s,f)(v)}return[h,g]}function Xe(e,t){return K(t)?t(e.current):t}function et(e,t){return e.current=he(he({},e.current),t),t}function tt(e,t,r){return K(t)?t(e.current):Object.keys(r).forEach(function(n){var a;return(a=t[n])===null||a===void 0?void 0:a.call(t,e.current[n])}),r}var rt={create:Ye},nt={paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs"}};function at(e){return function t(){for(var r=this,n=arguments.length,a=new Array(n),s=0;s<n;s++)a[s]=arguments[s];return a.length>=e.length?e.apply(this,a):function(){for(var f=arguments.length,h=new Array(f),g=0;g<f;g++)h[g]=arguments[g];return t.apply(r,[].concat(a,h))}}}function it(e){return{}.toString.call(e).includes("Object")}function ot(e){return e||ge("configIsRequired"),it(e)||ge("configType"),e.urls?(st(),{paths:{vs:e.urls.monacoBase}}):e}function st(){console.warn(ve.deprecation)}function ct(e,t){throw new Error(e[t]||e.default)}var ve={configIsRequired:"the configuration object is required",configType:"the configuration object should be an object",default:"an unknown error accured in `@monaco-editor/loader` package",deprecation:`Deprecation warning!
    You are using deprecated way of configuration.

    Instead of using
      monaco.config({ urls: { monacoBase: '...' } })
    use
      monaco.config({ paths: { vs: '...' } })

    For more please check the link https://github.com/suren-atoyan/monaco-loader#config
  `},ge=at(ct)(ve),ut={config:ot},lt=function(){for(var t=arguments.length,r=new Array(t),n=0;n<t;n++)r[n]=arguments[n];return function(a){return r.reduceRight(function(s,f){return f(s)},a)}};function xe(e,t){return Object.keys(t).forEach(function(r){t[r]instanceof Object&&e[r]&&Object.assign(t[r],xe(e[r],t[r]))}),pe(pe({},e),t)}var dt={type:"cancelation",msg:"operation is manually canceled"};function ie(e){var t=!1,r=new Promise(function(n,a){e.then(function(s){return t?a(dt):n(s)}),e.catch(a)});return r.cancel=function(){return t=!0},r}var ft=["monaco"],pt=rt.create({config:nt,isInitialized:!1,resolve:null,reject:null,monaco:null}),be=Ue(pt,2),Z=be[0],ae=be[1];function mt(e){var t=ut.config(e),r=t.monaco,n=Ie(t,ft);ae(function(a){return{config:xe(a.config,n),monaco:r}})}function ht(){var e=Z(function(t){var r=t.monaco,n=t.isInitialized,a=t.resolve;return{monaco:r,isInitialized:n,resolve:a}});if(!e.isInitialized){if(ae({isInitialized:!0}),e.monaco)return e.resolve(e.monaco),ie(oe);if(window.monaco&&window.monaco.editor)return ye(window.monaco),e.resolve(window.monaco),ie(oe);lt(gt,xt)(bt)}return ie(oe)}function gt(e){return document.body.appendChild(e)}function vt(e){var t=document.createElement("script");return e&&(t.src=e),t}function xt(e){var t=Z(function(n){var a=n.config,s=n.reject;return{config:a,reject:s}}),r=vt("".concat(t.config.paths.vs,"/loader.js"));return r.onload=function(){return e()},r.onerror=t.reject,r}function bt(){var e=Z(function(r){var n=r.config,a=r.resolve,s=r.reject;return{config:n,resolve:a,reject:s}}),t=window.require;t.config(e.config),t(["vs/editor/editor.main"],function(r){var n=r.m||r;ye(n),e.resolve(n)},function(r){e.reject(r)})}function ye(e){Z().monaco||ae({monaco:e})}function yt(){return Z(function(e){var t=e.monaco;return t})}var oe=new Promise(function(e,t){return ae({resolve:e,reject:t})}),je={config:mt,init:ht,__getMonacoInstance:yt},jt={wrapper:{display:"flex",position:"relative",textAlign:"initial"},fullWidth:{width:"100%"},hide:{display:"none"}},se=jt,wt={container:{display:"flex",height:"100%",width:"100%",justifyContent:"center",alignItems:"center"}},St=wt;function Ot({children:e}){return q.createElement("div",{style:St.container},e)}var Nt=Ot,Et=Nt;function Mt({width:e,height:t,isEditorReady:r,loading:n,_ref:a,className:s,wrapperProps:f}){return q.createElement("section",{style:{...se.wrapper,width:e,height:t},...f},!r&&q.createElement(Et,null,n),q.createElement("div",{ref:a,style:{...se.fullWidth,...!r&&se.hide},className:s}))}var Pt=Mt,we=o.memo(Pt);function Rt(e){o.useEffect(e,[])}var Se=Rt;function _t(e,t,r=!0){let n=o.useRef(!0);o.useEffect(n.current||!r?()=>{n.current=!1}:e,t)}var N=_t;function J(){}function V(e,t,r,n){return Ct(e,n)||Tt(e,t,r,n)}function Ct(e,t){return e.editor.getModel(Oe(e,t))}function Tt(e,t,r,n){return e.editor.createModel(t,r,n?Oe(e,n):void 0)}function Oe(e,t){return e.Uri.parse(t)}function Lt({original:e,modified:t,language:r,originalLanguage:n,modifiedLanguage:a,originalModelPath:s,modifiedModelPath:f,keepCurrentOriginalModel:h=!1,keepCurrentModifiedModel:g=!1,theme:v="light",loading:P="Loading...",options:S={},height:I="100%",width:k="100%",className:_,wrapperProps:$={},beforeMount:C=J,onMount:F=J}){let[w,E]=o.useState(!1),[R,b]=o.useState(!0),y=o.useRef(null),x=o.useRef(null),A=o.useRef(null),c=o.useRef(F),l=o.useRef(C),j=o.useRef(!1);Se(()=>{let u=je.init();return u.then(p=>(x.current=p)&&b(!1)).catch(p=>(p==null?void 0:p.type)!=="cancelation"&&console.error("Monaco initialization: error:",p)),()=>y.current?z():u.cancel()}),N(()=>{if(y.current&&x.current){let u=y.current.getOriginalEditor(),p=V(x.current,e||"",n||r||"text",s||"");p!==u.getModel()&&u.setModel(p)}},[s],w),N(()=>{if(y.current&&x.current){let u=y.current.getModifiedEditor(),p=V(x.current,t||"",a||r||"text",f||"");p!==u.getModel()&&u.setModel(p)}},[f],w),N(()=>{let u=y.current.getModifiedEditor();u.getOption(x.current.editor.EditorOption.readOnly)?u.setValue(t||""):t!==u.getValue()&&(u.executeEdits("",[{range:u.getModel().getFullModelRange(),text:t||"",forceMoveMarkers:!0}]),u.pushUndoStop())},[t],w),N(()=>{var u,p;(p=(u=y.current)==null?void 0:u.getModel())==null||p.original.setValue(e||"")},[e],w),N(()=>{let{original:u,modified:p}=y.current.getModel();x.current.editor.setModelLanguage(u,n||r||"text"),x.current.editor.setModelLanguage(p,a||r||"text")},[r,n,a],w),N(()=>{var u;(u=x.current)==null||u.editor.setTheme(v)},[v],w),N(()=>{var u;(u=y.current)==null||u.updateOptions(S)},[S],w);let M=o.useCallback(()=>{var T;if(!x.current)return;l.current(x.current);let u=V(x.current,e||"",n||r||"text",s||""),p=V(x.current,t||"",a||r||"text",f||"");(T=y.current)==null||T.setModel({original:u,modified:p})},[r,t,a,e,n,s,f]),Q=o.useCallback(()=>{var u;!j.current&&A.current&&(y.current=x.current.editor.createDiffEditor(A.current,{automaticLayout:!0,...S}),M(),(u=x.current)==null||u.editor.setTheme(v),E(!0),j.current=!0)},[S,v,M]);o.useEffect(()=>{w&&c.current(y.current,x.current)},[w]),o.useEffect(()=>{!R&&!w&&Q()},[R,w,Q]);function z(){var p,T,U,B;let u=(p=y.current)==null?void 0:p.getModel();h||((T=u==null?void 0:u.original)==null||T.dispose()),g||((U=u==null?void 0:u.modified)==null||U.dispose()),(B=y.current)==null||B.dispose()}return q.createElement(we,{width:k,height:I,isEditorReady:w,loading:P,_ref:A,className:_,wrapperProps:$})}var kt=Lt;o.memo(kt);function At(e){let t=o.useRef();return o.useEffect(()=>{t.current=e},[e]),t.current}var It=At,re=new Map;function $t({defaultValue:e,defaultLanguage:t,defaultPath:r,value:n,language:a,path:s,theme:f="light",line:h,loading:g="Loading...",options:v={},overrideServices:P={},saveViewState:S=!0,keepCurrentModel:I=!1,width:k="100%",height:_="100%",className:$,wrapperProps:C={},beforeMount:F=J,onMount:w=J,onChange:E,onValidate:R=J}){let[b,y]=o.useState(!1),[x,A]=o.useState(!0),c=o.useRef(null),l=o.useRef(null),j=o.useRef(null),M=o.useRef(w),Q=o.useRef(F),z=o.useRef(),u=o.useRef(n),p=It(s),T=o.useRef(!1),U=o.useRef(!1);Se(()=>{let d=je.init();return d.then(m=>(c.current=m)&&A(!1)).catch(m=>(m==null?void 0:m.type)!=="cancelation"&&console.error("Monaco initialization: error:",m)),()=>l.current?Ne():d.cancel()}),N(()=>{var m,O,W,D;let d=V(c.current,e||n||"",t||a||"",s||r||"");d!==((m=l.current)==null?void 0:m.getModel())&&(S&&re.set(p,(O=l.current)==null?void 0:O.saveViewState()),(W=l.current)==null||W.setModel(d),S&&((D=l.current)==null||D.restoreViewState(re.get(s))))},[s],b),N(()=>{var d;(d=l.current)==null||d.updateOptions(v)},[v],b),N(()=>{!l.current||n===void 0||(l.current.getOption(c.current.editor.EditorOption.readOnly)?l.current.setValue(n):n!==l.current.getValue()&&(U.current=!0,l.current.executeEdits("",[{range:l.current.getModel().getFullModelRange(),text:n,forceMoveMarkers:!0}]),l.current.pushUndoStop(),U.current=!1))},[n],b),N(()=>{var m,O;let d=(m=l.current)==null?void 0:m.getModel();d&&a&&((O=c.current)==null||O.editor.setModelLanguage(d,a))},[a],b),N(()=>{var d;h!==void 0&&((d=l.current)==null||d.revealLine(h))},[h],b),N(()=>{var d;(d=c.current)==null||d.editor.setTheme(f)},[f],b);let B=o.useCallback(()=>{var d;if(!(!j.current||!c.current)&&!T.current){Q.current(c.current);let m=s||r,O=V(c.current,n||e||"",t||a||"",m||"");l.current=(d=c.current)==null?void 0:d.editor.create(j.current,{model:O,automaticLayout:!0,...v},P),S&&l.current.restoreViewState(re.get(m)),c.current.editor.setTheme(f),h!==void 0&&l.current.revealLine(h),y(!0),T.current=!0}},[e,t,r,n,a,s,v,P,S,f,h]);o.useEffect(()=>{b&&M.current(l.current,c.current)},[b]),o.useEffect(()=>{!x&&!b&&B()},[x,b,B]),u.current=n,o.useEffect(()=>{var d,m;b&&E&&((d=z.current)==null||d.dispose(),z.current=(m=l.current)==null?void 0:m.onDidChangeModelContent(O=>{U.current||E(l.current.getValue(),O)}))},[b,E]),o.useEffect(()=>{if(b){let d=c.current.editor.onDidChangeMarkers(m=>{var W;let O=(W=l.current.getModel())==null?void 0:W.uri;if(O&&m.find(D=>D.path===O.path)){let D=c.current.editor.getModelMarkers({resource:O});R==null||R(D)}});return()=>{d==null||d.dispose()}}return()=>{}},[b,R]);function Ne(){var d,m;(d=z.current)==null||d.dispose(),I?S&&re.set(s,l.current.saveViewState()):(m=l.current.getModel())==null||m.dispose(),l.current.dispose()}return q.createElement(we,{width:k,height:_,isEditorReady:b,loading:g,_ref:j,className:$,wrapperProps:C})}var Ut=$t,Dt=o.memo(Ut),Vt=Dt;const ce=[{id:"basic_load",label:"Basic Load Test",script:`import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://test-api.k6.io/public/crocodiles/');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
`},{id:"stress_test",label:"Stress Test (Ramping)",script:`import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
`},{id:"spike_test",label:"Spike Test",script:`import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '10s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '10s', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.5);
}
`},{id:"soak_test",label:"Soak Test",script:`import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5m', target: 50 },
    { duration: '1h', target: 50 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<1500'],
  },
};

export default function () {
  const res = http.get('__TARGET_URL__');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(2);
}
`},{id:"api_crud",label:"API CRUD Operations",script:`import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
};

const BASE_URL = '__TARGET_URL__';
const headers = { 'Content-Type': 'application/json' };

export default function () {
  let id;

  group('Create', () => {
    const res = http.post(BASE_URL, JSON.stringify({ name: 'test' }), { headers });
    check(res, { 'created': (r) => r.status === 201 });
    id = res.json('id');
  });

  group('Read', () => {
    const res = http.get(\`\${BASE_URL}/\${id}\`);
    check(res, { 'fetched': (r) => r.status === 200 });
  });

  group('Update', () => {
    const res = http.put(\`\${BASE_URL}/\${id}\`, JSON.stringify({ name: 'updated' }), { headers });
    check(res, { 'updated': (r) => r.status === 200 });
  });

  group('Delete', () => {
    const res = http.del(\`\${BASE_URL}/\${id}\`);
    check(res, { 'deleted': (r) => r.status === 200 || r.status === 204 });
  });

  sleep(1);
}
`}];function Jt(){const[e]=Ee(),t=Me(),r=e.get("testId"),[n,a]=o.useState(ce[0].script),[s,f]=o.useState(""),[h,g]=o.useState(!!r),[v,P]=o.useState(!1),[S,I]=o.useState(!1),[k,_]=o.useState(null),[$,C]=o.useState(!1),[F,w]=o.useState(!0),[E,R]=o.useState(r);o.useEffect(()=>{if(!r){g(!1);return}Y.get(r).then(c=>{a(c.data.script||""),f(c.data.name||""),R(r)}).catch(c=>{var l,j;return _(((j=(l=c.response)==null?void 0:l.data)==null?void 0:j.error)||"Failed to load test")}).finally(()=>g(!1))},[r]);const b=o.useCallback(c=>{a(c||""),C(!1),w((c==null?void 0:c.includes("export default"))??!1)},[]),y=c=>{const l=ce.find(j=>j.id===c);l&&(a(l.script),C(!1))},x=async()=>{var c,l,j;P(!0),_(null);try{if(E)await Y.update(E,{script:n,name:s||void 0});else{const M=await Y.create({name:s||"Untitled Script",script:n,script_source:"script_editor"});R((c=M.data)==null?void 0:c.id)}C(!0),setTimeout(()=>C(!1),3e3)}catch(M){_(((j=(l=M.response)==null?void 0:l.data)==null?void 0:j.error)||"Failed to save")}finally{P(!1)}},A=async()=>{var c,l,j;if(E||await x(),!(!E&&!k)){I(!0);try{const M=await Y.run(E);t(`/live/${((c=M.data)==null?void 0:c.id)||E}`)}catch(M){_(((j=(l=M.response)==null?void 0:l.data)==null?void 0:j.error)||"Failed to start run")}finally{I(!1)}}};return h?i.jsx("div",{className:"flex items-center justify-center h-96",children:i.jsx(X,{className:"w-8 h-8 text-accent animate-spin"})}):i.jsxs(ee.div,{initial:{opacity:0},animate:{opacity:1},className:"flex gap-4 h-[calc(100vh-8rem)]",children:[i.jsxs(ee.div,{initial:{opacity:0,x:-20},animate:{opacity:1,x:0},transition:{delay:.1},className:"w-72 shrink-0 flex flex-col gap-4",children:[i.jsxs("div",{className:"glass-card p-4 space-y-4",children:[i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(Pe,{className:"w-5 h-5 text-accent"}),i.jsx("h2",{className:"font-semibold text-text-primary",children:"Script Editor"})]}),i.jsxs("div",{className:"space-y-1.5",children:[i.jsx("label",{className:"text-sm font-medium text-text-secondary",children:"Test Name"}),i.jsx("input",{className:"w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 transition-colors",placeholder:"My Load Test",value:s,onChange:c=>f(c.target.value)})]}),i.jsxs("div",{className:"space-y-1.5",children:[i.jsx("label",{className:"text-sm font-medium text-text-secondary",children:"Template"}),i.jsxs("div",{className:"relative",children:[i.jsxs("select",{className:"w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent/60 transition-colors",onChange:c=>y(c.target.value),defaultValue:"",children:[i.jsx("option",{value:"",disabled:!0,children:"Choose a template..."}),ce.map(c=>i.jsx("option",{value:c.id,children:c.label},c.id))]}),i.jsx(Re,{className:"absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"})]})]}),i.jsx("div",{className:"flex items-center gap-2 text-sm",children:F?i.jsxs(i.Fragment,{children:[i.jsx(ue,{className:"w-4 h-4 text-success"}),i.jsx("span",{className:"text-success",children:"Valid script"})]}):i.jsxs(i.Fragment,{children:[i.jsx(le,{className:"w-4 h-4 text-warning"}),i.jsx("span",{className:"text-warning",children:"Missing default export"})]})})]}),i.jsxs("div",{className:"space-y-2",children:[i.jsxs("button",{onClick:x,disabled:v,className:"w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bg-card border border-border hover:border-accent/50 text-text-secondary rounded-lg transition-colors text-sm disabled:opacity-50",children:[v?i.jsx(X,{className:"w-4 h-4 animate-spin"}):$?i.jsx(ue,{className:"w-4 h-4 text-success"}):i.jsx(_e,{className:"w-4 h-4"}),v?"Saving...":$?"Saved!":"Save Script"]}),i.jsxs("button",{onClick:A,disabled:S||v,className:"w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50",children:[S?i.jsx(X,{className:"w-4 h-4 animate-spin"}):i.jsx(Ce,{className:"w-4 h-4"}),S?"Starting...":"Run Test"]})]}),k&&i.jsxs(ee.div,{initial:{opacity:0},animate:{opacity:1},className:"flex items-center gap-2 px-3 py-2.5 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm",children:[i.jsx(le,{className:"w-4 h-4 shrink-0"})," ",k]}),i.jsxs("div",{className:"glass-card p-4 flex-1",children:[i.jsx("h3",{className:"text-xs font-medium text-text-muted uppercase tracking-wider mb-3",children:"Quick Reference"}),i.jsxs("div",{className:"space-y-2 text-xs text-text-secondary",children:[i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(G,{className:"w-3 h-3 text-accent"})," ",i.jsx("code",{children:"http.get(url)"})]}),i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(G,{className:"w-3 h-3 text-accent"})," ",i.jsx("code",{children:"http.post(url, body)"})]}),i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(G,{className:"w-3 h-3 text-accent"})," ",i.jsxs("code",{children:["check(res, ","{}",")"]})]}),i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(G,{className:"w-3 h-3 text-accent"})," ",i.jsx("code",{children:"sleep(seconds)"})]}),i.jsxs("div",{className:"flex items-center gap-2",children:[i.jsx(G,{className:"w-3 h-3 text-accent"})," ",i.jsx("code",{children:"group(name, fn)"})]})]})]})]}),i.jsx(ee.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},transition:{delay:.15},className:"flex-1 glass-card overflow-hidden",children:i.jsx(Vt,{height:"100%",defaultLanguage:"javascript",theme:"vs-dark",value:n,onChange:b,options:{fontSize:14,minimap:{enabled:!0},padding:{top:16},scrollBeyondLastLine:!1,smoothScrolling:!0,wordWrap:"on",tabSize:2,automaticLayout:!0},loading:i.jsx("div",{className:"flex items-center justify-center h-full",children:i.jsx(X,{className:"w-6 h-6 text-accent animate-spin"})})})})]})}export{Jt as default};
