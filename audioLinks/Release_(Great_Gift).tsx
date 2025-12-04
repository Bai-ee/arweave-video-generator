/*global ShopifyBuy*/
import React, { useContext, useRef } from "react";
import et004 from './et004hand.jpg'; // Import the image
import AudioPlayer from "react-h5-audio-player";
import Collapsible from 'react-collapsible';
import ShopifyBuyButton2 from './ShopifyBuyButton2'; // Import the module

// import et001 from './assets/et001hand.jpg'; // Import the image
// import et002 from './assets/et002hand.jpg'; // Import the image
// import et003 from './assets/et003hand.jpg'; // Import the image
// import et004 from './assets/et004hand.jpg'; // Import the image
import et003 from './et003hand.jpg'; // Import the image
// {/* <img src={et005} */}


{/* <img src={et005} */}


interface GreatGiftProps {
  genre: string[];// Adding a genre prop
  // Include other props if there are any
}

const Release_Great_Gift: React.FC<GreatGiftProps> = ({ genre }) => {

    // media player data Type
type musicData = {
    trackName: string;
    artistName: string;
    src: string;
  };

    const musicTracks: musicData[] = [
        {
          trackName: "GREAT GIFT",
          artistName: "Bai-ee",
          src: "https://github.com/Bai-ee/public_audio/raw/main/A_GREAT_GIFT_(Bai-ee)_Clip.mp3?raw=true",
        },   
      ];


  return (
    <div>
    
  {/* Product 1 */}
  <div className="group p-6 sm:p-8 rounded-md border bg-transparent border-yellow-75 dark:shadow-none shadow-2xl shadow-gray-600/10">
  <div className="relative overflow-hidden rounded-xl bg-gray-800">
  <img src={et003}
    alt="art cover" loading="lazy" className="w-full object-cover object-top transition duration-500 group-hover:scale-105" />
  </div>
  <div className="mt-6 relative">
    <div className="mt-6 mb-2 relative flex flex-col sm:flex-row justify-between gap-2">
      <div className="relative flex flex-col border-0 border-yellow-75 rounded-md w-full justify-center">
       

      {/* // */}
      <div className="release_name">
        BOXXED
        </div>
        <p className="mt-0 release_namesub">
        Bai-ee
        </p>
        <p className="mt-0 release_namesub">
        ET002
        </p>
        <div className="edit_button">
          <a href="/preview/et003">
          <button className="uppercase leading-tight h-4 mt-auto text-sm">EDIT</button>
          </a>
        </div>
      {/* // */}


        <div className="flex flex-row w-full justify-center p-2 pb-0 rounded-md gap-2 px-0">
          <div className="playButtonCont ">
            <div className="releasePlayer">
              <AudioPlayer
              src={musicTracks[0].src}
              style={{ backgroundColor: "#ffffff" }}
              showJumpControls={false}
              showFilledProgress={false}
              customVolumeControls={[]}
              customAdditionalControls={[]}
              />
            </div>
          </div>
          <div className="
          uppercase leading-tight mt-auto
          text-lg font-mathias w-full
          h-20 text-yellow-75 text-center
          rounded-md flex items-center
          justify-center checkoutBg
          ">
            <ShopifyBuyButton2 />
          </div>
        </div>
      </div>
    </div>
    <Collapsible trigger="MORE INFO ►" triggerWhenOpen="Close" classParentString="releaseDropdown" className="font-mathias text-center py-4 mb-2 rounded-md mb-0 shadow-2xl hover:opacity-50 font-mathias md:mt-0 w-full hover-50 text-xl sm:text-3xl border bg-yellow-75 mt-2 hidden">
      <div className="text-yellow-75 justify">
        <div className="font-mathias w-full flex flex-row items-center text-center justify-between gap-x-2 mt-4 mb-8">
          ALSO AT:
          {/* Links to external sources */}
        </div>
        {/* Additional product details */}
      </div>
    </Collapsible>
  </div>
</div>




    </div>
  );
}

export default Release_Great_Gift;
