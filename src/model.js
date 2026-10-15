export const sections = ['summary', 'experience', 'education', 'skills', 'projects'];
export const blankProfile = () => ({name:'',headline:'',email:'',phone:'',location:'',links:'',...Object.fromEntries(sections.map(s=>[s,'']))});
export const emptyState = () => ({profile:blankProfile(),versions:[],imports:[]});
export function createVersion(profile, title, id = crypto.randomUUID()) {
  return {id,title:title.trim() || 'Untitled resume',updated:new Date().toISOString(),job:'',profile:{...profile},included:[...sections]};
}
export function validateState(value) {
  const validProfile = p => p && Object.keys(blankProfile()).every(k=>typeof p[k]==='string');
  if (!value || !validProfile(value.profile) || !Array.isArray(value.versions) || !Array.isArray(value.imports)) throw new Error('Invalid backup file.');
  if (!value.versions.every(v=>typeof v.id==='string' && typeof v.title==='string' && typeof v.updated==='string' && typeof v.job==='string' && validProfile(v.profile) && Array.isArray(v.included) && v.included.every(s=>sections.includes(s)))) throw new Error('Invalid resume in backup.');
  if (!value.imports.every(i=>typeof i.id==='string' && typeof i.name==='string' && typeof i.text==='string')) throw new Error('Invalid document in backup.');
  return value;
}
export function resumeText(version) {
  const p=version.profile;
  return [p.name,p.headline,[p.email,p.phone,p.location,p.links].filter(Boolean).join(' | '),...sections.filter(s=>version.included.includes(s)&&p[s].trim()).flatMap(s=>[s.toUpperCase(),p[s]])].filter(Boolean).join('\n\n');
}
