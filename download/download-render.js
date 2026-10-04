const download_div = document.getElementById("download-div");
const download_btn = document.getElementById("download-btn");
const download_btn_2 = document.getElementById("download-btn-2");
const download_in_index = document.getElementById('download-in-index');

window.addEventListener('beforeinstallprompt',(event)=>{
    event.preventDefault();
    console.log('👍🏻','beforeinstallprompt',event);

    window.deferredPrompt = event;
})

download_btn.addEventListener('click', async ()=>{
    console.log('👍🏻','download-btn clicked')
    const promptEvent = window.deferredPrompt;
    console.log(promptEvent);
    if (!promptEvent){
        return
    }

  
    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    console.log('👍🏻','user choice' , result);

    window.deferredPrompt = null; 

})

download_btn_2.addEventListener('click',async ()=>{
    console.log('👍🏻','download btn 2 cliked !');
    const promptEvent2 = window.deferredPrompt;
    
    if(!promptEvent2){
        return;
    }

    promptEvent2.prompt()
    const result2 = await promptEvent2.userChoice;
    console.log('👍🏻','user Choice' , result2);

    window.deferredPrompt = null

})


download_in_index.addEventListener('click',async()=>{
    console.log('download in index btn clicked');
    const pormptEvent_index = window.deferredPrompt;
    
    if (!pormptEvent_index){
        return
    }

    pormptEvent_index.prompt();

    window.deferredPrompt = null ;
})

window.addEventListener('appinstaled', ()=>{
    console.log('👍🏻','app instaled',event);
    window.deferredPrompt = null;
})