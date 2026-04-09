import{h as x,r,j as e,L as y}from"./index-B54GYx1z.js";import{m}from"./proxy-b45PZvPh.js";import{B as g,C as f}from"./copy-CEq9LmbM.js";import{M as j}from"./mail-DhEHt8lB.js";import{C as p}from"./circle-check-D8Y2VuoK.js";import{S as b}from"./save-DQ5-OsPc.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["line",{x1:"6",x2:"6",y1:"3",y2:"15",key:"17qcm7"}],["circle",{cx:"18",cy:"6",r:"3",key:"1h7g24"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}],["path",{d:"M18 9a9 9 0 0 1-9 9",key:"n2h4wq"}]],v=x("git-branch",N);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["path",{d:"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",key:"w46dr5"}]],S=x("puzzle",A);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["path",{d:"M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2",key:"q3hayz"}],["path",{d:"m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06",key:"1go1hn"}],["path",{d:"m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",key:"qlwsc0"}]],w=x("webhook",k),d="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-colors",C=`# .github/workflows/load-test.yml
name: Performance Test
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1-5'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Load Test
        env:
          SARFAT_API_KEY: \${{ secrets.SARFAT_API_KEY }}
          SARFAT_BASE_URL: \${{ secrets.SARFAT_BASE_URL }}
        run: |
          curl -X POST "\${SARFAT_BASE_URL}/api/v1/tests/\${TEST_ID}/run" \\
            -H "Authorization: Bearer \${SARFAT_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d '{"source": "ci", "commit": "GITHUB_SHA"}'`,T=`# .gitlab-ci.yml
load-test:
  stage: test
  image: alpine/curl
  only:
    - main
  script:
    - |
      curl -X POST "\${SARFAT_BASE_URL}/api/v1/tests/\${TEST_ID}/run" \\
        -H "Authorization: Bearer \${SARFAT_API_KEY}" \\
        -H "Content-Type: application/json" \\
        -d '{"source": "ci", "commit": "'$CI_COMMIT_SHA'"}'`;function h({title:s,code:a,language:l="yaml"}){const[i,t]=r.useState(!1),c=()=>{navigator.clipboard.writeText(a),t(!0),setTimeout(()=>t(!1),2e3)};return e.jsxs("div",{className:"bg-bg-primary border border-border/60 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-2 border-b border-border/40",children:[e.jsx("span",{className:"text-xs font-medium text-text-muted",children:s}),e.jsx("button",{onClick:c,className:"flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors",children:i?e.jsxs(e.Fragment,{children:[e.jsx(p,{className:"w-3 h-3 text-success"})," Copied"]}):e.jsxs(e.Fragment,{children:[e.jsx(f,{className:"w-3 h-3"})," Copy"]})})]}),e.jsx("pre",{className:"p-4 text-xs font-mono text-text-secondary overflow-x-auto",children:a})]})}function $(){const[s,a]=r.useState(!1),[l,i]=r.useState(!1),[t,c]=r.useState({slackWebhook:"",genericWebhook:"",email:""}),u=()=>{a(!0),setTimeout(()=>{a(!1),i(!0),setTimeout(()=>i(!1),3e3)},800)};return e.jsxs(m.div,{initial:{opacity:0},animate:{opacity:1},className:"space-y-6 max-w-4xl mx-auto",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx(S,{className:"w-6 h-6 text-accent"}),e.jsx("h1",{className:"text-2xl font-bold text-text-primary",children:"Integrations"})]}),e.jsx("p",{className:"text-text-secondary mt-1",children:"Connect Sarfat Load Testing with your existing tools and workflows"})]}),e.jsxs(m.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},transition:{delay:.05},className:"glass-card p-6 space-y-5",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(v,{className:"w-5 h-5 text-accent"}),e.jsx("h2",{className:"text-lg font-semibold text-text-primary",children:"CI/CD Integration"})]}),e.jsx("p",{className:"text-sm text-text-secondary",children:"Trigger load tests automatically from your CI/CD pipeline. Add these configurations to run performance tests on every deployment."}),e.jsxs("div",{className:"space-y-4",children:[e.jsx(h,{title:"GitHub Actions",code:C}),e.jsx(h,{title:"GitLab CI",code:T})]})]}),e.jsxs(m.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},transition:{delay:.1},className:"glass-card p-6 space-y-5",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(g,{className:"w-5 h-5 text-accent"}),e.jsx("h2",{className:"text-lg font-semibold text-text-primary",children:"Notification Channels"})]}),e.jsx("p",{className:"text-sm text-text-secondary",children:"Get notified when tests complete, SLAs are breached, or regressions are detected."}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsxs("label",{className:"text-sm font-medium text-text-secondary flex items-center gap-2",children:[e.jsx("span",{className:"w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center text-white text-xs font-bold",children:"#"}),"Slack Webhook URL"]}),e.jsx("input",{className:d,placeholder:"https://hooks.slack.com/services/T.../B.../...",value:t.slackWebhook,onChange:o=>c(n=>({...n,slackWebhook:o.target.value}))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsxs("label",{className:"text-sm font-medium text-text-secondary flex items-center gap-2",children:[e.jsx(w,{className:"w-4 h-4 text-text-muted"}),"Generic Webhook URL"]}),e.jsx("input",{className:d,placeholder:"https://your-server.com/webhook/sarfat",value:t.genericWebhook,onChange:o=>c(n=>({...n,genericWebhook:o.target.value}))})]}),e.jsxs("div",{className:"space-y-1.5",children:[e.jsxs("label",{className:"text-sm font-medium text-text-secondary flex items-center gap-2",children:[e.jsx(j,{className:"w-4 h-4 text-text-muted"}),"Email Notifications"]}),e.jsx("input",{className:d,type:"email",placeholder:"team@company.com",value:t.email,onChange:o=>c(n=>({...n,email:o.target.value}))})]})]}),e.jsxs("button",{onClick:u,disabled:s,className:"flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-light text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors",children:[s?e.jsx(y,{className:"w-4 h-4 animate-spin"}):l?e.jsx(p,{className:"w-4 h-4 text-white"}):e.jsx(b,{className:"w-4 h-4"}),s?"Saving...":l?"Saved!":"Save Configuration"]})]})]})}export{$ as default};
