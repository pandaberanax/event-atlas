import {captureMapPage,detectAccessIssue} from './page-access.js';
const labels={
 title:['Website Map · link halaman','Website Map · page links'],
 help:['Buka halaman hingga tampil normal. Salin kode dari Website Map → Hubungkan Chrome di dashboard, lalu kirim link halaman ini. Cakupan subfolder mengikuti dashboard.','Wait until the page displays normally. Copy the code from Website Map → Connect Chrome in the dashboard, then send this page’s links. Subfolder scope follows the dashboard.'],
 pairing:['Kode koneksi Website Map','Website Map pairing code'],send:['Kirim link halaman','Send page links'],
 auto:['Ambil otomatis saat halaman/link berubah','Capture automatically when the page or links change'],
 note:['Biarkan DevTools terbuka. Hanya URL, judul, dan link dalam origin yang sama dikirim; cookie dan isi form tidak dikirim. Tidak perlu memulai rekaman event.','Keep DevTools open. Only URLs, the title and same-origin links are sent; cookies and form values are not sent. Event recording is not required.'],
 ready:['Siap mengambil link.','Ready to capture links.'],sending:['Mengirim link…','Sending links…'],
 sent:['Link diterima. Total {n} URL dalam hasil mapping.','Links received. {n} total URLs in the mapping result.'],
 pairingError:['Kode ditolak/kedaluwarsa atau project berubah. Hubungkan Chrome lagi dari Website Map.','The code was rejected/expired or the project changed. Connect Chrome again from Website Map.'],
 scopeError:['Halaman berada di luar website, subfolder, atau kedalaman target.','The page is outside the target website, subfolder or depth.'],
 blocked:['Halaman masih menampilkan verifikasi akses. Selesaikan di tab website sebelum mengirim link.','The page still shows access verification. Complete it in the website tab before sending links.'],
 busy:['Scan/audit sedang berjalan. Tunggu selesai sebelum mengirim link.','A scan/audit is running. Wait until it finishes before sending links.'],
 error:['Gagal mengirim link. Pastikan engine lokal v1.7.1 aktif dan kode sudah diisi.','Could not send links. Check that the local v1.7.1 engine is running and a code is entered.'],
 unavailable:['Halaman HTTP(S) ini belum bisa dibaca.','This HTTP(S) page could not be read.']
};
export function createMapCapture({inspect,language}){
  const $=id=>document.getElementById(id);let busy=false,state='ready',count=0,timer,last='';
  function text(key){return labels[key][language()==='en'?1:0].replace('{n}',String(count));}
  function render(){for(const el of document.querySelectorAll('[data-map-label]'))el.textContent=text(el.dataset.mapLabel);
    $('mapCaptureStatus').textContent=text(state);$('mapSend').disabled=busy;}
  async function send(manual=false){
    if(busy)return;const code=$('mapPairing').value.trim();if(!code){state='pairingError';render();return;}
    busy=true;
    try{
      const snapshot=await inspect('('+captureMapPage.toString()+')('+detectAccessIssue.toString()+')');
      if(!snapshot){state='unavailable';return;}
      if(snapshot.accessIssue){state='blocked';return;}
      const fingerprint=JSON.stringify([snapshot.page,snapshot.links]);if(!manual&&last===fingerprint)return;
      state='sending';render();
      const response=await fetch('http://127.0.0.1:4318/api/manual/map-links',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
        headers:{'Content-Type':'application/json','X-Atlas-Pairing':code},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(10000)});
      const result=await response.json();
      if(!response.ok){
        state=response.status===403?'pairingError':result.error==='pageVerificationRequired'?'blocked':response.status===409?'busy':
          ['mapBrowserOutsideScope','mapBrowserWrongSite'].includes(result.error)?'scopeError':'error';
        if(response.status===403){clearInterval(timer);$('mapAuto').checked=false;}return;
      }
      count=result.urls;last=fingerprint;state='sent';
    }catch{state='error';}
    finally{busy=false;render();}
  }
  $('mapSend').onclick=()=>void send(true);
  $('mapPairing').oninput=()=>{last='';};
  $('mapAuto').onchange=()=>{clearInterval(timer);if($('mapAuto').checked){void send();timer=setInterval(()=>void send(),3000);}};
  window.addEventListener('pagehide',()=>clearInterval(timer));render();
  return {render};
}
