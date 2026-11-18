// Read older exports without duplicating their one label into the training set.
export const labelsFor=s=>Array.isArray(s.labels)?s.labels:(s.label?[s.label]:[]);
export function overlaps(labels,range,except=-1){return labels.some((l,i)=>i!==except&&range[0]<l.range[1]&&range[1]>l.range[0]);}
export function validLabels(s){const labels=labelsFor(s);return (!('labels'in s)||Array.isArray(s.labels))&&labels.every((l,i)=>l&&['stationary','jumping','forward','other'].includes(l.type)&&Number.isInteger(l.count)&&l.count>=0&&l.count<=2000&&(l.type!=='other'||l.count===0)&&Array.isArray(l.range)&&l.range.length===2&&l.range.every(Number.isFinite)&&l.range[0]>=0&&l.range[1]>l.range[0]&&l.range[1]<=s.duration+.05&&!overlaps(labels,l.range,i));}
