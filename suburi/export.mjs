let googleReady;
export function loadGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(googleReady)return googleReady;
 googleReady=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;const timer=setTimeout(fail,15000);function fail(){clearTimeout(timer);s.remove();googleReady=null;reject(Error('Could not load Google sign-in. Check your connection.'));}s.onload=()=>{clearTimeout(timer);if(window.google?.accounts?.oauth2)resolve();else fail();};s.onerror=fail;document.head.append(s);});return googleReady;
}
export function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function upload(file,clientId){
 // Called directly from a user gesture after GIS has loaded.
 const token=await new Promise((resolve,reject)=>{const c=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:r=>r.error||!r.access_token?reject(Error('Google authorization was not completed.')):resolve(r.access_token),error_callback:()=>reject(Error('Sign-in was closed or blocked. Allow popups and try again.'))});c.requestAccessToken({prompt:'select_account'});});
 const body=new FormData();body.append('metadata',new Blob([JSON.stringify({name:file.name,mimeType:'application/json'})],{type:'application/json'}));body.append('file',file);
 const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:`Bearer ${token}`},body,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`Drive upload failed (${response.status}). Check your Drive API setup.`);
 const result=await response.json();if(!result.id)throw Error('No file ID received. Check My Drive before retrying.');return `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`;
}
// Chrome/Android may reject JSON attachments even with a valid user gesture.
// A .txt extension and text/plain are widely accepted Web Share file types.
// Contents stay exactly the same JSON, so analysis tools can JSON.parse it.
export function shareFile(file){return new File([file],`${file.name}.txt`,{type:'text/plain'});}
export function shareFailure(error){
 if(error.name==='AbortError')return 'Sharing cancelled. Your data is still available.';
 if(error.name==='NotAllowedError'||/permission|denied/i.test(error.message))return 'The phone or browser denied file sharing. Use Export data to save the JSON, then upload it from the Google Drive app. You can also use direct Drive upload below. Your recording is safe.';
 return `Sharing failed: ${error.message}. Use Export data and upload the saved file in Drive.`;
}
