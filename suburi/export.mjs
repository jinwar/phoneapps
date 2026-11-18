export function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
// Chrome/Android may reject JSON attachments even with a valid user gesture.
// A .txt extension and text/plain are widely accepted Web Share file types.
// Contents stay exactly the same JSON, so analysis tools can JSON.parse it.
export function shareFile(file){return new File([file],`${file.name}.txt`,{type:'text/plain'});}
export function shareFailure(error){
 if(error.name==='AbortError')return 'Sharing cancelled. Your data is still available.';
 if(error.name==='NotAllowedError'||/permission|denied/i.test(error.message))return 'The phone or browser denied file sharing. Use Export data to save the JSON, then attach it from your email or Drive app. Your recording is safe.';
 return `Sharing failed: ${error.message}. Use Export data and attach the saved file in your email or Drive app.`;
}
