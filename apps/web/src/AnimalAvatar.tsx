import type { ReactNode } from "react";

type Art = {
  coat: string; face: string; paper: string; nose: string;
  shape?: string; ears?: ReactNode; mask?: ReactNode; markings?: ReactNode;
  mouth?: "wide" | "beak" | "trunk"; eyes?: [number, number, number, number];
};

const head = "M12 40C12 25 21 17 35 17c12 0 22 7 22 20 0 15-10 21-25 21-13 0-20-7-20-18Z";
const cheeks = "M15 45c0-7 6-11 13-7 4 2 7 1 10-2 4-4 12-5 16 0 5 8-3 19-18 20-10 1-21-3-21-11Z";

function roundEars(coat: string, inner: string) {
  return <g><circle cx="18" cy="23" r="9" fill={coat}/><circle cx="45" cy="19" r="8" fill={coat}/>
    <circle cx="18" cy="23" r="4.6" fill={inner}/><circle cx="45" cy="19" r="4" fill={inner}/></g>;
}
function pointedEars(coat: string, inner: string) {
  return <g><path d="M12 31c-2-8-1-17 2-22 6 2 12 5 16 12l8-2c5-7 10-11 15-12 2 7 1 14-1 22Z" fill={coat}/>
    <path d="M16 25c-1-4-1-8 0-11 4 2 7 4 9 7m19-1c2-4 4-6 7-8v8" fill={inner}/></g>;
}
function dots(color: string) {
  return <g fill={color}><circle cx="22" cy="44" r="1"/><circle cx="25" cy="47" r=".9"/><circle cx="28" cy="44" r=".8"/></g>;
}
const penguinMask = "M16 42c0-10 8-17 16-11l4 3c4-7 8-10 13-7 7 4 7 19 0 24-7 6-32 7-33-9Z";
const flatSnout = "M14 41c0-13 9-20 21-20 8 0 14 3 17 8 7 2 9 8 8 14-1 10-11 14-24 14-14 0-22-6-22-16Z";

const art: Record<string, Art> = {
  otter: {
    coat:"#93593f", face:"#ffe6ba", paper:"#e9caaa", nose:"#4f302d",
    ears:roundEars("#93593f","#cf956d"),
    markings:<>{dots("#b98a66")}<path d="M17 54q4-3 8 2m21-1q4-4 8-3" fill="none" stroke="#76442f" strokeWidth="2" strokeLinecap="round"/></>,
  },
  penguin: {
    coat:"#273f62", face:"#fff3db", paper:"#bcd7ec", nose:"#ed963f", mask:<path d={penguinMask} fill="#fff3db"/>, mouth:"beak",
    markings:<path d="M28 57q8-1 17-5l3 9H28Z" fill="#fff3db"/>,
  },
  capybara: {
    coat:"#b57a52", face:"#d7a477", paper:"#f1d7a2", nose:"#583b38", shape:flatSnout,
    ears:<g fill="#895c45"><ellipse cx="22" cy="23" rx="4" ry="7" transform="rotate(-22 22 23)"/><ellipse cx="44" cy="22" rx="4" ry="6"/></g>,
    mask:<path d="M35 41c0-7 5-12 12-13 8 1 13 6 12 12-1 8-10 12-17 11-5-1-7-4-7-10Z" fill="#d5a376"/>, eyes:[26,35,47,32],
    markings:dots("#876044"),
  },
  "red-panda": {
    coat:"#ba533e", face:"#ffdfb1", paper:"#f2c9ab", nose:"#4d2c31",
    ears:pointedEars("#a5463a","#ffe3c0"),
    mask:<g fill="#ffdfb1"><path d={cheeks}/><path d="M20 31q7-10 13-4l-4 5Zm19-6q7-7 12 0l-3 4Z"/></g>,
    markings:<path d="M15 40l11-4-2 7-7 3m34-16 5 5-6 4-2-5" fill="#7a3b39"/>,
  },
  fox: {
    coat:"#da7647", face:"#fff0d5", paper:"#f2cda0", nose:"#4c3336", ears:pointedEars("#d46d43","#f5b794"),
    shape:"M11 36C13 23 25 17 36 18c12 0 18 6 21 15l4 5c0 7-10 16-24 18-12 2-24-7-26-20Z",
    mask:<path d="M12 37q14 1 24 10 12-15 22-12l3 4c-4 10-11 16-26 17-11 0-20-8-23-19Z" fill="#fff0d5"/>,
  },
  cat: {
    coat:"#697da1", face:"#dce3f1", paper:"#d9d0ec", nose:"#765b75", ears:pointedEars("#687da0","#dbaab9"),
    markings:<g fill="none" stroke="#5b6d91" strokeWidth="1.3" strokeLinecap="round"><path d="M31 21l1 5m4-7 1 5m3-4 1 3M15 41l6 2m-8 3h7m32-5 5-1m-4 4 5 1"/></g>,
  },
  shiba: {
    coat:"#d99153", face:"#fff0d7", paper:"#eee0b0", nose:"#5e4039", ears:pointedEars("#c98551","#f1b894"),
    mask:<g fill="#fff0d7"><path d={cheeks}/><ellipse cx="25" cy="29" rx="4" ry="2"/><ellipse cx="45" cy="26" rx="3.5" ry="2"/></g>,
  },
  rabbit: {
    coat:"#e4bac3", face:"#fff4ea", paper:"#dcd3ef", nose:"#a6647b",
    ears:<g><path d="M21 27C13 17 12 5 17 3c5-2 11 8 13 20m8 2C35 12 39 2 44 3c5 0 6 11 1 23" fill="#dbaebc"/>
      <path d="M22 20c-3-5-5-10-3-12 2 0 5 7 6 12m16 0c-1-5 0-12 3-13 2 2 1 9-1 13" fill="#f7d8da"/></g>,
    markings:<rect x="38" y="43" width="5" height="5" rx="1.4" fill="#fff"/>,
  },
  bear: {
    coat:"#bd865c", face:"#f8d39a", paper:"#e4d8b2", nose:"#513633", ears:roundEars("#a46b4f","#dfae83"),
    mask:<ellipse cx="39" cy="44" rx="15" ry="11" fill="#f8d39a"/>,
  },
  panda: {
    coat:"#f8edda", face:"#ffefd9", paper:"#a5cfb6", nose:"#352e3a", ears:roundEars("#3e3948","#646071"),
    mask:<g fill="#524b5e"><ellipse cx="26" cy="35" rx="8" ry="6" transform="rotate(-27 26 35)"/>
      <ellipse cx="46" cy="31" rx="7" ry="5.5" transform="rotate(21 46 31)"/><path d="M16 54q6 4 12 4l-3 7H15Z"/></g>,
    markings:<path d="M45 55l10-7 2 11h-9Z" fill="#524b5e"/>,
  },
  koala: {
    coat:"#9395b1", face:"#e7dae6", paper:"#d4cde8", nose:"#454357",
    ears:<g><ellipse cx="14" cy="27" rx="10" ry="11" fill="#9998b5"/><ellipse cx="47" cy="20" rx="10" ry="11" fill="#9998b5"/>
      <ellipse cx="14" cy="27" rx="6" ry="7" fill="#d5bdd0"/><ellipse cx="47" cy="20" rx="6" ry="7" fill="#d5bdd0"/></g>,
    mouth:"wide",
  },
  seal: {
    coat:"#a6bdce", face:"#e9f4ec", paper:"#cde4e1", nose:"#526f82", shape:"M12 44c0-14 9-23 23-24 13-1 24 7 24 19 0 12-9 18-23 18-14 0-24-3-24-13Z",
    markings:<>{dots("#768f9b")}<path d="M17 49l9-1m-9 4 7-1m25-7 8-2m-7 4 6-1" fill="none" stroke="#869ba4" strokeWidth="1" strokeLinecap="round"/></>,
  },
  raccoon: {
    coat:"#8f96a5", face:"#e9e4df", paper:"#cbd8e9", nose:"#2f343f", ears:pointedEars("#818a9d","#d6c8cf"),
    mask:<><path d={cheeks} fill="#ebe7e3"/><path d="M16 34c7-7 13-8 23-6 9-5 16-3 18 3-3 9-9 12-16 8l-3-5c-5 7-14 9-22 3Z" fill="#454d60"/></>,
    markings:<path d="M19 50q6 4 10 3" stroke="#c1b9b9" fill="none" strokeWidth="1.5" strokeLinecap="round"/>,
  },
  squirrel: {
    coat:"#ac6548", face:"#ffdfb1", paper:"#eed1ab", nose:"#553932",
    ears:<><path d="M14 52c-12 1-11-19-5-26 6-9 17-6 18 1 1 4-5 13-2 15Z" fill="#864939"/>
      {pointedEars("#ad6647","#e6a685")}</>,
    markings:<path d="M31 24q3-4 7-5m-4 7 5-4" fill="none" stroke="#c78260" strokeWidth="2" strokeLinecap="round"/>,
  },
  hedgehog: {
    coat:"#9b7058", face:"#f9d5ae", paper:"#e6cfba", nose:"#4a3432", shape:flatSnout,
    ears:<path d="M13 49 8 44l1-6-3-5 5-4-1-5 7-1 1-6 7 1 4-6 6 3 6-3 4 4 7 1 1 6 5 4-6 8-12 17-13 6Z" fill="#724e47"/>,
    markings:<path d="M14 37l4 3m1-13 5 3m2-6 4 2m4-4 4 2" fill="none" stroke="#c09171" strokeWidth="1.5" strokeLinecap="round"/>,
  },
  frog: {
    coat:"#68a86d", face:"#d6e7a0", paper:"#d5e7bb", nose:"#385d52",
    ears:<g fill="#68a86d"><circle cx="24" cy="26" r="9"/><circle cx="45" cy="22" r="9"/></g>,
    shape:"M11 40c0-10 7-16 20-15l10-2c10-1 18 5 18 15 0 12-12 18-26 18-13 0-22-6-22-16Z",
    eyes:[24,25,45,21], markings:dots("#83ac68"),
  },
  duck: {
    coat:"#efc264", face:"#fff0bb", paper:"#f0df9f", nose:"#da824b", shape:flatSnout, mouth:"beak",
    markings:<path d="M25 24q2-8 7-9-1 3 1 7 3-7 7-6l-1 6" fill="#dfac55"/>,
  },
  chick: {
    coat:"#e7b744", face:"#ffeaa6", paper:"#f7d5a1", nose:"#d98048", mouth:"beak",
    ears:<path d="M28 21c-3-4-2-9 1-12 4-1 7 4 7 8 2-5 5-7 8-6 1 4-1 9-6 12Z" fill="#e7b744"/>,
    markings:<ellipse cx="24" cy="45" rx="4" ry="2.4" fill="#eca084"/>,
  },
  owl: {
    coat:"#946958", face:"#f5d5a9", paper:"#e0cbb7", nose:"#d79553", ears:pointedEars("#846053","#c08c73"), mouth:"beak",
    mask:<g fill="#f5d5a9"><ellipse cx="27" cy="37" rx="12" ry="13"/><ellipse cx="46" cy="33" rx="11" ry="12"/><ellipse cx="37" cy="49" rx="16" ry="8"/></g>,
    markings:<path d="M26 53l3 3 4-3m5 2 3 3 4-3" stroke="#c8a175" fill="none" strokeWidth="1.3" strokeLinecap="round"/>,
  },
  deer: {
    coat:"#b57f64", face:"#ffe6c6", paper:"#e2d9be", nose:"#572e36",
    ears:<g><path d="M28 24 24 12l-5-5m6 8 3-8m13 17 5-11 5-5m-6 7-1-8" fill="none" stroke="#79554c" strokeWidth="2.6" strokeLinecap="round"/>
      <path d="M24 26C12 24 7 20 8 16c8-3 16 1 20 8m16-2c4-8 11-11 17-8 1 4-6 10-14 12" fill="#b57f64"/></g>,
    markings:<g fill="#ffe5c7"><circle cx="27" cy="27" r="1.4"/><circle cx="33" cy="25" r="1.4"/><circle cx="39" cy="24" r="1.2"/></g>,
  },
  sheep: {
    coat:"#f5e8d2", face:"#c3a0a1", paper:"#d6d4ec", nose:"#5e484e",
    ears:<g fill="#b79299"><ellipse cx="13" cy="33" rx="8" ry="5" transform="rotate(21 13 33)"/><ellipse cx="51" cy="24" rx="8" ry="5" transform="rotate(-20 51 24)"/></g>,
    shape:"M13 39q-4-7 3-12 0-7 8-7 4-6 11-3 7-5 13 2 8 1 8 8 6 5 2 12 3 7-5 12-5 7-14 5-9 4-16-2-9-1-10-9Z",
    mask:<ellipse cx="36" cy="41" rx="18" ry="13" transform="rotate(-12 36 41)" fill="#c3a0a1"/>,
  },
  elephant: {
    coat:"#9daac7", face:"#c3cce1", paper:"#cfdef0", nose:"#7183a7", mouth:"trunk",
    ears:<g><ellipse cx="16" cy="37" rx="11" ry="14" fill="#8798bd"/><ellipse cx="15" cy="37" rx="7" ry="10" fill="#c4a9c3"/>
      <ellipse cx="49" cy="28" rx="9" ry="11" fill="#8798bd"/></g>,
    mask:<ellipse cx="37" cy="42" rx="17" ry="12" fill="#b9c5df"/>,
  },
  tiger: {
    coat:"#cb814d", face:"#fbe6bf", paper:"#f2d3af", nose:"#583837",
    ears:roundEars("#9b6047","#eac2ab"),
    markings:<g fill="none" stroke="#734e43" strokeWidth="2" strokeLinecap="round"><path d="M18 34l6 3m-8 2 5 2m11-20 2 6m3-8 2 6m2-6 2 4m9 3 4 1m-4 4 4 1"/></g>,
  },
  hamster: {
    coat:"#c49868", face:"#fff2ca", paper:"#efcfd3", nose:"#8f5666",
    ears:roundEars("#ad835e","#e9b5ad"),
    mask:<path d="M13 44c0-7 6-12 13-11 5 0 9 4 13 2 8-5 16-3 17 5 2 9-10 16-21 16-13 0-22-5-22-12Z" fill="#fff2ca"/>,
    markings:<ellipse cx="22" cy="46" rx="4.5" ry="2.7" fill="#e4aaa0"/>,
  },
};

export function AnimalAvatar({ animal }: { animal: string }) {
  const design = art[animal] ?? art.otter;
  const [x1, y1, x2, y2] = design.eyes ?? [27, 35, 46, 30];
  return <svg className="animal-avatar-art" viewBox="0 0 64 64" data-animal={animal} aria-hidden="true">
    <rect width="64" height="64" fill={design.paper}/>
    {design.ears}
    <path d="M17 64c0-11 9-16 22-16 12 0 17 8 17 16Z" fill={design.coat}/>
    <path d={design.shape ?? head} fill={design.coat}/>
    {design.mask ?? <path d={cheeks} fill={design.face}/>}
    {design.markings}
    {[ [x1,y1], [x2,y2] ].map(([x,y]) => <g key={x}>
      <ellipse cx={x} cy={y} rx="4.2" ry="4.8" fill="#fff3dd"/>
      <ellipse cx={x + 1.15} cy={y - 1.45} rx="2.1" ry="2.7" fill="#352b37"/>
      <circle cx={x + 1.85} cy={y - 2.35} r=".68" fill="#fff"/>
    </g>)}
    {design.mouth === "beak" ? <path d="M35 39c3-4 6-6 10-5l7 2c-2 4-7 5-12 6Z" fill={design.nose}/>
      : design.mouth === "trunk" ? <path d="M38 39c0-6 8-7 11-4 5 5 1 10 8 8 4-2 6 2 2 5-10 6-18 0-21-9Z" fill={design.nose}/>
      : design.mouth === "wide" ? <ellipse cx="41" cy="38" rx="4.1" ry="6.2" fill={design.nose}/>
      : <g fill={design.nose}><path d="M35 38q4-3 8-2 1 2-3 5-2 0-5-3Z"/>
        <path d="M39 40v3q2 2 4 0" stroke={design.nose} strokeWidth="1.2" fill="none" strokeLinecap="round"/></g>}
  </svg>;
}
