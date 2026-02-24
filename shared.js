// ============================================================
// CONSTANTS
// ============================================================
var MONTHS_TH = [‘มกราคม’,‘กุมภาพันธ์’,‘มีนาคม’,‘เมษายน’,‘พฤษภาคม’,‘มิถุนายน’,‘กรกฎาคม’,‘สิงหาคม’,‘กันยายน’,‘ตุลาคม’,‘พฤศจิกายน’,‘ธันวาคม’];
var MONTHS_SHORT = [‘ม.ค.’,‘ก.พ.’,‘มี.ค.’,‘เม.ย.’,‘พ.ค.’,‘มิ.ย.’,‘ก.ค.’,‘ส.ค.’,‘ก.ย.’,‘ต.ค.’,‘พ.ย.’,‘ธ.ค.’];
var DAYS_TH = [‘อาทิตย์’,‘จันทร์’,‘อังคาร’,‘พุธ’,‘พฤหัส’,‘ศุกร์’,‘เสาร์’];
var CATEGORIES = {
home: {
income: [‘เงินเดือน’,‘โบนัส’,‘ค่าเช่า’,‘ดอกเบี้ย’,‘อื่นๆ’],
expense: [‘อาหาร’,‘เดินทาง’,‘สาธารณูปโภค’,‘ช้อปปิ้ง’,‘สุขภาพ’,‘บันเทิง’,‘การศึกษา’,‘ซ่อมบำรุง’,‘อื่นๆ’]
},
farm: {
income: [‘ขายพืชผล’,‘ขายสัตว์’,‘เงินอุดหนุน’,‘อื่นๆ’],
expense: [‘เมล็ดพันธุ์’,‘ปุ๋ย’,‘ยาฆ่าแมลง’,‘น้ำมัน’,‘ค่าแรง’,‘อุปกรณ์’,‘อื่นๆ’]
}
};

// ============================================================
// HELPERS
// ============================================================
function fmt(n) { return (parseFloat(n)||0).toLocaleString(‘th-TH’); }
function todayStr() {
var d=new Date();
return d.getFullYear()+’-’+String(d.getMonth()+1).padStart(2,‘0’)+’-’+String(d.getDate()).padStart(2,‘0’);
}
function formatDateTH(str) {
if (!str) return ‘-’;
var d=new Date(str); if (isNaN(d)) return str;
return d.getDate()+’ ‘+MONTHS_TH[d.getMonth()]+’ ’+(d.getFullYear()+543);
}

// ============================================================
// DATA
// ============================================================
function loadData() {
var raw=localStorage.getItem(‘banharnData’);
if (raw) { try { return JSON.parse(raw); } catch(e){} }
return {home:{transactions:[],budgets:[],debts:[]},farm:{transactions:[],budgets:[],debts:[]}};
}
function saveData(data) { localStorage.setItem(‘banharnData’,JSON.stringify(data)); }

// ============================================================
// NAVIGATION
// ============================================================
function goHome()   { window.location.href = ‘index.html’; }
function goManage() { window.location.href=‘manage.html’; }
function goReport() { window.location.href=‘report.html’; }

// ============================================================
// MODAL
// ============================================================
function openModal(id)  { document.getElementById(id).classList.add(‘open’); document.body.style.overflow=‘hidden’; }
function closeModal(id) { document.getElementById(id).classList.remove(‘open’); document.body.style.overflow=’’; }

// ============================================================
// TOAST
// ============================================================
var _toastTm;
function showToast(msg) {
var t=document.getElementById(‘toast-el’);
if (!t) {
t=document.createElement(‘div’); t.id=‘toast-el’;
t.style.cssText=‘position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:#6C3212;color:#FAF0E6;padding:9px 18px;border-radius:8px;font-family:Sarabun,sans-serif;font-size:13px;z-index:999;transition:opacity 0.3s;white-space:nowrap;pointer-events:none;’;
document.body.appendChild(t);
}
t.textContent=msg; t.style.opacity=‘1’;
clearTimeout(_toastTm);
_toastTm=setTimeout(function(){ t.style.opacity=‘0’; },2500);
}