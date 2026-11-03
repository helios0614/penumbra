import{c as s,l as e,dT as a}from"./index-CQNVDD9o.js";/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n=[["path",{d:"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",key:"1pljnt"}],["path",{d:"M16 14v6",key:"1j4efv"}],["path",{d:"M8 14v6",key:"17c4r9"}],["path",{d:"M12 16v6",key:"c8a4gj"}]],r=s("cloud-rain",n);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",key:"p7xjir"}]],i=s("cloud",d);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o=[["path",{d:"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",key:"1ptgy4"}],["path",{d:"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",key:"1sl1rz"}]],l=s("droplets",o);function u(){const t={temp:26,condition:"sunny",humidity:65},c=()=>{switch(t.condition){case"sunny":return e.jsx(a,{className:"size-8 text-primary"});case"cloudy":return e.jsx(i,{className:"size-8 text-muted-foreground"});case"rainy":return e.jsx(r,{className:"size-8 text-blue-400"});default:return e.jsx(a,{className:"size-8 text-primary"})}};return e.jsxs("div",{className:"flex items-center justify-between h-full",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[c(),e.jsxs("div",{children:[e.jsxs("div",{className:"text-2xl font-semibold text-foreground tabular-nums",children:[t.temp,"°"]}),e.jsxs("div",{className:"text-xs text-muted-foreground flex items-center gap-1",children:[e.jsx(l,{className:"size-3"}),t.humidity,"%"]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("div",{className:"text-xs text-muted-foreground",children:"北京"}),e.jsx("div",{className:"text-xs text-muted-foreground",children:"晴朗"})]})]})}export{u as WeatherWidget,u as default};
