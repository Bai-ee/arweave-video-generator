/*global ShopifyBuy*/
import React, { useContext, useRef } from "react";
import AudioPlayer from "react-h5-audio-player";
import Collapsible from 'react-collapsible';
import ShopifyBuyButtonLifted from './ShopifyBuyButton_Lifted'; // Import the module


interface LiftedProps {
  genre: string[]; // Adding a genre prop
  // Include other props if there are any
}

const Release_Lifted: React.FC<LiftedProps> = ({ genre }) => {

    // media player data Type
type musicData = {
    trackName: string;
    artistName: string;
    src: string;
  };

    const musicTracks: musicData[] = [
        {
          trackName: "TEST",
          artistName: "Bai-ee",
          src: "https://github.com/Bai-ee/public_audio/raw/main/BAI-EE%20-%20LIFTED%20(SC%20Preview%20Clip).mp3",
        },  
      ];


  return (
    <div>

{/* //product 3 */}
<div className="group p-6 sm:p-8 rounded-md border bg-transparent
  border-yellow-75 dark:shadow-none shadow-2xl shadow-gray-600/10">
    <div className="relative overflow-hidden rounded-xl bg-red-900">
      <img src="https://i.ibb.co/5LCCjBN/ACB494-EC-0688-4-A39-AE99-1-E2-D226-BFE64-1.png"
      alt="art cover" loading="lazy" className="w-full object-cover object-top transition duration-500 group-hover:scale-105" />    
    </div>
    <div className="mt-6 relative">
      <div className="mt-6 mb-2 relative flex flex-col sm:flex-row justify-between gap-2">
        <div className="mt-0 relative
        flex flex-col border-0
        border-yellow-75 rounded-md
          w-full justify-center ">


      {/* // */}
      <div className="release_name">
        LIFTED
        </div>
        <p className="mt-0 release_namesub">
        Bai-ee
        </p>
        <p className="mt-0 release_namesub">
        Housepit CHI
        </p>
        <div className="edit_button_muted">
          {/* <a href="/preview/et006"> */}
          <button className="uppercase leading-tight h-4 mt-auto text-sm">EDIT</button>
          {/* </a> */}
        </div>
      {/* // */}


        <div className="flex flex-row w-full justify-center p-2 pb-0 rounded-md gap-2 px-0">
        <div className="playButtonCont"> <div className="releasePlayer">
              <AudioPlayer
              style={{ backgroundColor: "#ffffff" }}
              src={musicTracks[0].src}
              showJumpControls={false}
              showFilledProgress={false}
              customVolumeControls={[]}
              customAdditionalControls={[]}
              />
            </div>
          </div>
          <div className="
          uppercase leading-tight mt-auto text-lg font-mathias 
          w-full h-20 text-yellow-75 text-center
          rounded-md flex items-center justify-center checkoutBg">
            <ShopifyBuyButtonLifted />
          </div>
        </div>
      </div>
    </div>



<Collapsible trigger="MORE INFO ►" triggerWhenOpen="Close"
classParentString="releaseDropdown"
className="
font-mathias  text-center  py-4 
mb-2 rounded-md mb-0 shadow-2xl
hover:opacity-50 font-mathias md:mt-0 w-full
hover-50 text-xl sm:text-3xl border
bg-yellow-75 mt-2 hidden">
<div className="text-yellow-75 justify ">
<div className=" font-mathias w-full flex flex-row items-center text-center justify-left gap-x-2 mt-4 mb-8 justify-between">
ALSO AT:
{/* tracksource */}
{/* <a href="https://www.traxsource.com/track/6307889/no-mills" target="_blank" rel="noopener noreferrer" className=""> */}
<div className="opacity-20 hover-50 w-8 h-8 bg-yellow-75 border-2 border-yellow-75 rounded-md">
<img  className="rounded-md p-1 bg-black" src="https://i.postimg.cc/fRk8BrMy/trksource.jpg"></img>
</div>
{/* </a> */}
{/* bandcamp */}
{/* <a href="https://housepitchi.bandcamp.com/track/acid-beach-objkt-612561" target="_blank" rel="noopener noreferrer" className=""> */}
<div className="hover-50 w-8 h-8 bg-yellow-75  border-2 border-yellow-75 rounded-md">
<img className="rounded-md" src="https://i.postimg.cc/QdzBQrGd/image-243.jpg"></img>
</div>
{/* </a> */}

{/* beatport */}
{/* <a href="https://www.beatport.com/track/no-mills/11925148" target="_blank" rel="noopener noreferrer" className=""> */}
<div className="opacity-20 hover-50 w-8 h-8 bg-yellow-7  border-2 border-yellow-755 rounded-md">
<img  className="rounded-md" src="https://i.postimg.cc/L51Q8DV9/download.png"></img>
</div>
{/* </a> */}

{/* spotify */}
{/* <a href="" target="_blank" rel="noopener noreferrer" className=""> */}
<div className=" opacity-20 w-8 h-8 bg-yellow-75  border-2 border-yellow-75 rounded-md">
<img  className="rounded-md" src="https://i.postimg.cc/vm4tdswJ/Spotify-App-Logo-svg.png"></img>
</div>
{/* </a> */}

{/* apple */}
{/* <a href="https://www.beatport.com/track/no-mills/11925148" target="_blank" rel="noopener noreferrer" className=""> */}
<div className="w-8 h-8 opacity-20  bg-yellow-75  border-2 border-yellow-75 rounded-md">
<img  className="rounded-md" src="
https://i.postimg.cc/zXVR2kwB/apple-7446229-960-720.png"></img>
</div>
{/* </a> */}
</div>
{/* <p>
  This concept first him me while on a beach in Oahu, Hi. I was inspired by the crashing waves while
  playing
  with a battery operated Korg 303 emulator. More than anything those crashes stood out 
  as each bar progressed from within the headphones.
  
</p> */}
{/* <div style={divStyle} id="section" className="min-h-screen flex justify-center items-center "></div> */}
<div className="flex flex-row w-full justify-center p-2 pb-0 rounded-md gap-2 px-0 mt-4">
<div  className="p-1 playButtonCont justify-left h-20 w-full 
text-yellow-75 text-left text-sm sm:text-md rounded-md pl-0 flex justify-center p-2
text-xxs items-center border border-yellow-75">
PRODUCER: Bai-ee<br></br>
RELEASE: Genesis LP <br></br>
EDIT: Original 12" <br></br>
</div>
<div  className="p-1 playButtonCont justify-left h-20 w-full border
border-yellow-75 text-xs sm:text-xs md:text-xs text-black text-left rounded-md pl-3 flex justify-center items-center">
LABEL: Housepit CHI<br></br>
YEAR: 2021 |
BPM: 122<br></br>GENRE: Acid House<br></br>
</div>
</div>
<div className="flex flex-row w-full justify-center p-2 pb-0 rounded-md gap-2 px-0 mt-4">
<div  className="p-1 playButtonCont justify-left h-20 w-full 
bg-black text-yellow-75  text-black text-left rounded-md pl-3 flex
justify-center items-center font-mathias">
<img  className="rounded-md w-30 " src="
https://i.postimg.cc/DfNYcpxf/verrt_logo_w_head.png
"></img>
</div>
<div className="p-1 playButtonCont justify-left h-20 w-full border
border-transparent  text-yellow-75  text-left rounded-md pl-3
flex justify-center text-md sm:text-md  md:text-md items-center font-mathias">
ARCHIVED <br></br>    
CHAIN: Tezos<br></br>
STORAGE: IPFS
</div>
</div>
<div  className="p-1 playButtonCont justify-left h-20 w-full pt-0
text-yellow-75 bg-black text-left rounded-md pl-0 flex justify-center items-center
justify-center p-0 pb-0 rounded-md gap-2 px-0 mt-1
flex items-center justify-space-arounds">
<a href="https://edittrax.com/preview/et001" target="_blank" 
rel="noopener noreferrer" className="w-full">
<div className="
uppercase leading-tight  text-2xl font-mathias 
w-auto px-6 h-18 text-yellow-75 text-center border
rounded-md flex items-center justify-center flex-row
py-6  bg-red-900  mb-0 mt-8 w-full">
COLLECT ►
</div>
</a>   
</div>
<div className="flex flex-row w-full justify-center p-2 pb-0 rounded-md gap-2 px-0 mt-4">
</div>
</div>

</Collapsible>


    
    {/* <button
    id=""
        className="flex justify-start justify-center flex-col md:flex-row
        w-full sm:justify-center mt-0 text-center
        font-mathias outline_button_main text-center w-34 py-4 px-11
        mb-2 rounded-md mb-0 shadow-2xl
        hover:opacity-50 font-mathias md:mt-0 w-full
        hover-50 text-xl sm:text-3xl  
        bg-yellow-75 mt-2 text-black releaseDropdown"

        >
          EDIT THIS TRACK
      </button> */}


    {/* <Collapsible trigger="MORE INFO >" triggerWhenOpen="Close"
    classParentString="releaseDropdown"
    className="
    font-mathias outline_button_main text-center w-34 py-4 px-11
    mb-2 rounded-md mb-0 shadow-2xl
    hover:opacity-50 font-mathias md:mt-0 w-full
    hover-50 text-xl sm:text-3xl border
    bg-yellow-75 mt-2">

    <div className="">
      <p>
        This is the collapsible content. It can be any element or React
        component you like.
      </p>
      <p>
        It can even be another Collapsible component. Check out the next
        section!
      </p>
    </div>
    </Collapsible> */}


  </div>
</div>






    </div>
  );
}

export default Release_Lifted;
