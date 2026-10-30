"use strict";
// The content bank is the single source of truth for the four Month 9 weeks.
const REPORT_MONTH = Number(window.GP_REPORT_PERIOD?.month) || 9;
const REPORT_LEVEL = "C";
const QUESTION_TOTAL = 20;
const SECTION_TOTAL = 5;
const REPORT_WEEKS = window[`Level${REPORT_LEVEL}Month9Weeks`];
if(!Array.isArray(REPORT_WEEKS)||REPORT_WEEKS.length!==4) throw new Error("Month 9 report questions did not load.");
for(const week of REPORT_WEEKS){
  if(!Array.isArray(week.questions)||week.questions.length!==QUESTION_TOTAL)throw new Error(`Week ${week.week} needs exactly ${QUESTION_TOTAL} questions.`);
  for(const section of ["Phonics","Sentences","Reading","Math"]){if(week.questions.filter(item=>item.section===section).length!==SECTION_TOTAL)throw new Error(`Week ${week.week} needs ${SECTION_TOTAL} ${section} questions.`)}
  for(const item of week.questions){if(item.choices?.length!==2||!Number.isInteger(item.answer)||item.answer<0||item.answer>1||item.audioChoices)throw new Error(`Level ${REPORT_LEVEL} questions need two visual choices without a sound-check gate.`)}
}
const colors={Phonics:"#ff7043",Sentences:"#ffc928",Reading:"#24a9e6",Math:"#35c48d"};
const sectionLabels={Phonics:"Phonics",Sentences:"Key Words & Sentences",Reading:"Comprehension",Math:"Math"};
const sportIcons={Phonics:"Aa",Sentences:"💬",Reading:"📖",Math:"🔢"};
let activeWeek=1;
let questions=[];
let current=0,answers=[],choiceOrders=[],student="Little Learner";
let reportBlob=null,reportUrl="";
let recordedChoiceAudio=null;
let practiceTimer=null,practiceAudio=null,promptTimer=null;
let lastScore=0,dressupApplied=0,dressupInitialized=false,dressupClipTimer=null,dressupCompletedLevel=0;
const dressupConfigs=window.GP_DRESSUP_CONFIGS||{};
const $=id=>document.getElementById(id);

// Keep the established Month 8 answer recordings and navigation boing.
let audioContext,answerFxAudio=null,answerFxTimer=null,answerFxFinish=null;
let answerFxGeneration=0;
let correctAnimationTimer=null;
function tone(frequency,start,duration,volume=.08,type="sine"){
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==="suspended")audioContext.resume();
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
  oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now+start);
  gain.gain.setValueAtTime(.0001,now+start);gain.gain.exponentialRampToValueAtTime(volume,now+start+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+start+duration);
  oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now+start);oscillator.stop(now+start+duration+.02);
}
function playCartoonBoing(){
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==="suspended")audioContext.resume();
  const start=audioContext.currentTime,master=audioContext.createGain();
  master.gain.setValueAtTime(1.35,start);master.connect(audioContext.destination);
  const pop=audioContext.createOscillator(),popGain=audioContext.createGain();
  pop.type="sine";pop.frequency.setValueAtTime(220,start);pop.frequency.exponentialRampToValueAtTime(620,start+.095);pop.frequency.exponentialRampToValueAtTime(470,start+.15);
  popGain.gain.setValueAtTime(.0001,start);popGain.gain.exponentialRampToValueAtTime(.24,start+.01);popGain.gain.exponentialRampToValueAtTime(.0001,start+.17);
  pop.connect(popGain);popGain.connect(master);pop.start(start);pop.stop(start+.18);
  [{frequency:740,delay:.045,volume:.075},{frequency:980,delay:.092,volume:.065},{frequency:1320,delay:.138,volume:.055}].forEach(({frequency,delay,volume})=>{
    const note=audioContext.createOscillator(),gain=audioContext.createGain(),noteStart=start+delay;
    note.type="triangle";note.frequency.setValueAtTime(frequency,noteStart);note.frequency.exponentialRampToValueAtTime(frequency*1.08,noteStart+.07);
    gain.gain.setValueAtTime(.0001,noteStart);gain.gain.exponentialRampToValueAtTime(volume,noteStart+.008);gain.gain.exponentialRampToValueAtTime(.0001,noteStart+.095);
    note.connect(gain);gain.connect(master);note.start(noteStart);note.stop(noteStart+.105);
  });
}
function playSound(kind){
  if(kind==="correct"||kind==="wrong"){
    stopAnswerFx();
    const audio=new Audio(`assets/reused/audio/fx/${kind}-answer.mp3`);answerFxAudio=audio;audio.volume=.9;
    return new Promise(resolve=>{
      let finished=false;
      const finish=(continueFeedback=true)=>{
        if(finished)return;finished=true;
        audio.onloadedmetadata=audio.onended=audio.onerror=null;
        if(answerFxAudio===audio){
          if(answerFxTimer){clearTimeout(answerFxTimer);answerFxTimer=null}
          answerFxAudio=null;answerFxFinish=null;
        }
        resolve(continueFeedback);
      };
      answerFxFinish=finish;
      audio.onended=()=>finish();audio.onerror=()=>finish();
      if(kind==="correct"){
        audio.onloadedmetadata=()=>{
          if(finished||answerFxAudio!==audio)return;
          const trimStart=.25,trimEnd=.75;
          audio.playbackRate=2;
          audio.preservesPitch=true;
          audio.currentTime=Math.min(trimStart,Math.max(0,audio.duration-.1));
          audio.play().then(()=>{
            if(finished||answerFxAudio!==audio){audio.pause();return}
            answerFxTimer=setTimeout(()=>{audio.pause();finish()},Math.max(.1,audio.duration-trimStart-trimEnd)/audio.playbackRate*1000);
          }).catch(()=>finish());
        };
        audio.load();
      }else audio.play().catch(()=>finish());
    });
  }
  try{playCartoonBoing()}catch(error){/* The quiz still works if a browser blocks audio. */}
  return Promise.resolve();
}
function stopAnswerFx(){
  answerFxGeneration++;
  if(answerFxTimer){clearTimeout(answerFxTimer);answerFxTimer=null}
  const audio=answerFxAudio,finish=answerFxFinish;
  answerFxAudio=null;answerFxFinish=null;
  if(audio){audio.onloadedmetadata=audio.onended=audio.onerror=null;audio.pause();audio.currentTime=0}
  if(finish)finish(false);
}
function stopCorrectAnswerAnimation(){
  if(correctAnimationTimer){clearTimeout(correctAnimationTimer);correctAnimationTimer=null}
  document.querySelectorAll(".answer-celebration").forEach(element=>element.classList.remove("answer-celebration","fx-letter-pop","fx-octopus-wave","fx-olive-roll","fx-omelet-hop","fx-sentence-shine","fx-sport-cheer","fx-picture-cheer","fx-sort-snap","fx-number-jump"));
  document.querySelectorAll(".correct-spark-burst").forEach(element=>element.remove());
}
function playCorrectAnswerAnimation(item,index){
  if(!item.correctAnimation)return;
  stopCorrectAnswerAnimation();
  const selected=[...document.querySelectorAll(".choice")].find(button=>Number(button.dataset.choiceIndex)===index);
  const target=item.equalGroupModel?$("question-visual"):item.image?$("question-image"):selected;
  if(!target)return;
  target.classList.add("answer-celebration",`fx-${item.correctAnimation}`);
  const burst=document.createElement("div");burst.className="correct-spark-burst";burst.setAttribute("aria-hidden","true");
  ["★","✦","●","★","✦","●","★","✦"].forEach((symbol,position)=>{const sparkle=document.createElement("span");sparkle.textContent=symbol;sparkle.style.setProperty("--spark",position);burst.appendChild(sparkle)});
  document.querySelector(".question-card").appendChild(burst);
  correctAnimationTimer=setTimeout(stopCorrectAnswerAnimation,2800);
}

function activeWeekData(){return REPORT_WEEKS.find(entry=>Number(entry.week)===activeWeek)}
function stopSpeech(){
  if(promptTimer){clearTimeout(promptTimer);promptTimer=null}
  window.GPReportNarrationPlayer?.cancel();
  if("speechSynthesis" in window)window.speechSynthesis.cancel();
  document.querySelectorAll(".choice-listen.speaking,.practice-speaker.speaking").forEach(button=>{button.classList.remove("speaking");if(button.dataset.idleLabel)button.innerHTML=button.dataset.idleLabel});
}
function speakMessage(message,button){
  const text=typeof message==="string"?message:message?.text;
  if(!text)return;
  const start=()=>{if(button){button.dataset.idleLabel=button.dataset.idleLabel||button.innerHTML;button.classList.add("speaking");button.innerHTML='<span aria-hidden="true">🔊</span> Playing…'}};
  const restore=()=>{if(button){button.classList.remove("speaking");if(button.dataset.idleLabel)button.innerHTML=button.dataset.idleLabel}};
  const fallback=hooks=>{
    if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance!=="function"){hooks.onerror();return}
    const utterance=typeof message==="string"?new SpeechSynthesisUtterance(text):message;
    const voices=window.speechSynthesis.getVoices();
    const american=voices.filter(voice=>/^en[-_]US$/i.test(voice.lang));
    utterance.voice=american.find(voice=>/samantha|zira|aria|jenny|ava|allison|joanna/i.test(voice.name))||american[0]||voices.find(voice=>/^en/i.test(voice.lang))||null;
    utterance.lang="en-US";utterance.rate=.82;utterance.pitch=1.05;utterance.volume=1;
    utterance.onstart=hooks.onstart;utterance.onend=hooks.onend;utterance.onerror=hooks.onerror;
    window.speechSynthesis.speak(utterance);
    return()=>window.speechSynthesis.cancel();
  };
  if(window.GPReportNarration){
    const player=window.GPReportNarrationPlayer||(window.GPReportNarrationPlayer=window.GPReportNarration.create());
    return player.speak(text,{onstart:start,onfinish:restore,fallback});
  }
  // Retain the existing voice if the shared recorded player cannot load.
  fallback({onstart:start,onend:restore,onerror:restore});
}
function speakQuestion(){
  if(!questions[current]||!$("quiz").classList.contains("active"))return;
  stopAnswerFx();stopSpeech();
  speakMessage(questions[current].spokenPrompt||questions[current].q,$("question-listen-btn"));
}
function speakOption(index,button){
  stopAnswerFx();stopSpeech();
  const item=questions[current];if(!item)return;
  speakMessage((item.spokenChoices||item.choices)[index],button);
}
function stopRecordedChoice(){if(recordedChoiceAudio){recordedChoiceAudio.pause();recordedChoiceAudio.currentTime=0;recordedChoiceAudio=null}}
function stopPractice(){
  if(practiceTimer){clearTimeout(practiceTimer);practiceTimer=null}
  if(practiceAudio){practiceAudio.pause();practiceAudio.currentTime=0;practiceAudio=null}
  stopSpeech();
}
function playPractice(){
  stopAnswerFx();stopPractice();
  const item=questions[current];
  speakMessage(item.practice||item.choices[item.answer],$("practice-replay"));
}
function stopAllAudio(){
  stopPractice();stopRecordedChoice();stopAnswerFx();
  if(dressupClipTimer){clearTimeout(dressupClipTimer);dressupClipTimer=null}
  const video=$("dressup-celebration-video");if(video){video.dataset.rewardPlaybackSession=String((Number(video.dataset.rewardPlaybackSession)||0)+1);video.dataset.rewardPlaybackActive="";video.pause();}
}
function cancelReportCapture(){
  const button=$("capture-btn");
  button.dataset.captureGeneration=String((Number(button.dataset.captureGeneration)||0)+1);
  button._gpCaptureStage?.remove();button._gpCaptureStage=null;
  button.disabled=false;if(button.dataset.idleLabel)button.innerHTML=button.dataset.idleLabel;
}
function showScreen(id){
  cancelReportCapture();$("capture-modal").hidden=true;
  stopAllAudio();stopCorrectAnswerAnimation();
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.toggle("active",screen.id===id));
  $("week-pill").textContent=id==="week-select"?`📅 Month ${REPORT_MONTH}`:`📅 Month ${REPORT_MONTH} · Week ${activeWeek}`;
  window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
}
function cloneQuestions(){return activeWeekData().questions.map(item=>({...item,choices:[...item.choices]}))}
function makeChoiceOrders(){
  // Balance the two orientations across this report, then shuffle; no fixed answer side.
  const flips=questions.map((_,index)=>index%2===0);
  for(let i=flips.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[flips[i],flips[j]]=[flips[j],flips[i]]}
  return questions.map((item,index)=>item.choices.map((_,choice)=>choice).sort((a,b)=>flips[index]?b-a:a-b));
}
function selectWeek(week){
  const data=REPORT_WEEKS.find(entry=>Number(entry.week)===Number(week));if(!data)return;
  activeWeek=Number(week);questions=cloneQuestions();
  $("welcome").dataset.week=String(activeWeek);
  $("welcome-title").textContent=data.headline||data.title;
  $("week-learning-summary").textContent=data.summary||`${SECTION_TOTAL} phonics · ${SECTION_TOTAL} words and sentences · ${SECTION_TOTAL} comprehension · ${SECTION_TOTAL} math`;
  const hero=$("week-hero-image"),scene=document.querySelector(".report-hero-scene");
  hero.src=data.hero;hero.alt=data.heroAlt||"GP Friends learning together";scene.setAttribute("aria-label",hero.alt);
  showScreen("welcome");
  const url=new URL(location.href);url.searchParams.set("week",activeWeek);history.replaceState(null,"",url);
}
function start(){
  student=$("student-name").value.trim()||"Little Learner";
  questions=cloneQuestions();current=0;answers=[];choiceOrders=makeChoiceOrders();
  showScreen("quiz");renderQuestion();
}
function getMathImage(key){return activeWeekData()?.mathImages?.[key]||key}
function preloadNextQuestion(){
  const item=questions[current+1];if(!item)return;
  const sources=[item.image,item.countedItemImage,item.equalGroupModel?.itemImage,...(item.choiceImagePaths||[]),...(item.choiceImageGroups||[]).flat(),...(item.pattern||[]).filter(Boolean).map(getMathImage),...(item.choiceImages||[]).map(getMathImage)];
  [...new Set(sources.filter(Boolean))].forEach(src=>{const image=new Image();image.decoding="async";image.src=src});
}
function imageElement(source,alt,className){
  const image=document.createElement("img");image.src=source;image.alt=alt||"";image.decoding="async";if(className)image.className=className;return image;
}
function countedGroup(count,item){
  const group=document.createElement("span");group.className="counted-group";group.dataset.count=String(count);group.setAttribute("role","img");
  group.setAttribute("aria-label",`${count} ${count===1?item.countedItemName:item.countedItemPlural}`);
  for(let index=0;index<count;index++)group.appendChild(imageElement(item.countedItemImage,"","counted-item"));
  return group;
}
// The book reads a times b as b equal groups with a things in each group.
// Keep the assessed total unknown until the child chooses an answer.
function renderEqualGroupMultiplication(visual,item){
  const model=item.equalGroupModel;
  visual.className="question-visual c-multiplication-model";
  visual.dataset.perGroup=String(model.perGroup);
  visual.dataset.groups=String(model.groups);
  visual.setAttribute("aria-label",`${model.groups} groups with ${model.perGroup} ${model.itemPlural} in each group`);
  const caption=document.createElement("p");caption.className="c-group-caption";
  caption.textContent=`${model.perGroup} in each group · ${model.groups} groups`;
  visual.appendChild(caption);
  const strip=document.createElement("div");strip.className="c-equal-group-strip";
  strip.style.setProperty("--group-count",String(model.groups));
  const columns=model.perGroup===2||model.perGroup===3||model.perGroup===4?2:model.perGroup===8?4:3;
  for(let index=0;index<model.groups;index++){
    const card=document.createElement("figure");card.className="c-equal-group-card";
    card.dataset.group=String(index+1);
    card.setAttribute("aria-label",`Group ${index+1}: ${model.perGroup} ${model.itemPlural}`);
    const pictures=document.createElement("span");pictures.className="c-equal-group-items";
    pictures.style.setProperty("--item-columns",String(columns));pictures.dataset.count=String(model.perGroup);
    for(let n=0;n<model.perGroup;n++){
      const picture=imageElement(model.itemImage,"","c-multiplication-sprite");
      picture.setAttribute("aria-hidden","true");pictures.appendChild(picture);
    }
    const count=document.createElement("figcaption");count.className="c-cumulative-count";
    count.textContent=index===model.groups-1?"?":String(model.perGroup*(index+1));
    count.setAttribute("aria-label",index===model.groups-1?"How many altogether?":`${model.perGroup*(index+1)} so far`);
    card.append(pictures,count);strip.appendChild(card);
  }
  const sentence=document.createElement("p");sentence.className="c-multiplication-sentence";
  sentence.appendChild(document.createTextNode(`${model.perGroup} times ${model.groups} is `));
  const blank=document.createElement("span");blank.className="c-multiplication-unknown";blank.textContent="?";
  blank.setAttribute("aria-label","How many altogether?");sentence.append(blank,document.createTextNode("."));
  visual.append(strip,sentence);
}

function renderQuestion(){
  stopAllAudio();stopCorrectAnswerAnimation();
  $("quiz").classList.remove("has-answer");
  const item=questions[current],color=colors[item.section];
  $("quiz").classList.toggle("c-multiplication-question",Boolean(item.equalGroupModel));
  $("section-label").textContent=sectionLabels[item.section];$("section-label").style.color=color;
  $("progress-label").textContent=`${current+1} of ${questions.length}`;$("progress-bar").style.width=`${(current+1)/questions.length*100}%`;$("progress-bar").style.background=color;
  $("question-paw").querySelector("span").textContent=current+1;$("mascot").textContent=item.icon||sportIcons[item.section];$("question-tag").textContent=item.tag;
  $("question-tag").style.background=color+"25";$("question-tag").style.color=color;
  $("question-text").textContent=item.q;$("question-hint").textContent=item.hint||"Look, listen, and choose.";
  $("feedback").textContent="";$("feedback").className="feedback";$("practice-popup").hidden=true;$("practice-text").textContent="";$("next-btn").classList.remove("show");
  const visual=$("question-visual");visual.innerHTML="";visual.hidden=!(item.equalGroupModel||item.numberPair||item.pattern||item.joinParts||item.wholeCount);
  if(item.equalGroupModel){renderEqualGroupMultiplication(visual,item)}else if(item.joinParts||item.wholeCount){
    visual.className=`question-visual counted-model ${item.joinParts?"join-model":"whole-model"} ${item.countedItemShape}-items`;
    visual.setAttribute("aria-label",item.joinParts?"Put these two groups together":"Split this group into two parts");
    if(item.joinParts)item.joinParts.forEach(count=>visual.appendChild(countedGroup(count,item)));else visual.appendChild(countedGroup(item.wholeCount,item));
    const arrows=document.createElement("span");arrows.className="counted-arrows";arrows.textContent=item.joinParts?"↘  ↙":"↙  ↘";arrows.setAttribute("aria-hidden","true");visual.appendChild(arrows);
  }else if(item.numberPair){
    visual.className=`question-visual number-comparison${item.numberItems?" item-number-comparison":""}`;
    visual.setAttribute("aria-label",item.numberPair.join(" or "));
    item.numberPair.forEach((number,index)=>{
      const block=document.createElement("span");block.className=`math-number number-${index+1}`;
      if(item.numberItems){block.appendChild(imageElement(getMathImage(item.numberItems[index]),""));const value=document.createElement("b");value.textContent=number;block.appendChild(value)}else block.textContent=number;
      visual.appendChild(block);if(index===0){const or=document.createElement("b");or.className="math-vs";or.textContent="or";visual.appendChild(or)}
    });
  }else if(item.pattern){
    visual.className=`question-visual pattern-strip${item.choicePatterns?" pair-pattern-strip":""}`;
    visual.setAttribute("aria-label","Repeating picture pattern");
    item.pattern.forEach((key,index)=>{const tile=document.createElement("span");tile.className="pattern-tile";if(key)tile.appendChild(imageElement(getMathImage(key),item.patternAlts?.[index]||"Pattern picture"));else{tile.classList.add("empty");tile.textContent="?"}visual.appendChild(tile)});
  }else{visual.className="question-visual";visual.removeAttribute("aria-label")}
  const image=$("question-image");image.classList.toggle("native-diagram",Boolean(item.nativeDiagram));image.classList.toggle("square-diagram",item.nativeDiagram==="clock");image.classList.toggle("wide",Boolean(item.imageWide));image.classList.toggle("compact",Boolean(item.imageCompact));
  if(item.image&&!item.equalGroupModel){image.src=item.image;image.alt=item.imageAlt||"Question picture";image.hidden=false}else{image.hidden=true;image.removeAttribute("src");image.alt=""}
  $("question-image-label").textContent=item.imageLabel||"";$("question-image-label").hidden=!item.imageLabel;
  const choices=$("choices");choices.replaceChildren();choices.classList.toggle("visual-choices",Boolean(item.choiceImagePaths||item.choiceImages||item.choiceImageGroups||item.choicePatterns||item.choiceCounts||item.choiceParts));
  choices.classList.toggle("landscape-scene-choices",Boolean(item.choiceImagesLandscape));
  choices.classList.toggle("counted-choices",Boolean(item.choiceCounts||item.choiceParts));
  choices.classList.toggle("clock-choices",Boolean(item.clockChoices));
  choices.classList.toggle("native-count-choices",Boolean(item.nativeCountChoices));
  choices.classList.toggle("pair-choices",Boolean(item.choiceImageGroups?.some(group=>group.length===2)));
  (choiceOrders[current]||[0,1]).forEach((index,visualPosition)=>{
    const label=item.choices[index],wrap=document.createElement("div"),answer=document.createElement("button"),listen=document.createElement("button");
    wrap.className="choice-wrap";answer.className="choice";answer.type="button";answer.dataset.choiceIndex=index;answer.dataset.optionNumber=visualPosition+1;answer.setAttribute("aria-label",`${label}. Choose this answer`);
    answer.classList.toggle("wide-picture-choice",Boolean(item.choiceImagesWide));
    if(item.choiceParts){
      answer.classList.add("counted-choice","has-parts",`${item.countedItemShape}-items`);
      const parts=document.createElement("span");parts.className="parts-answer";item.choiceParts[index].forEach(count=>parts.appendChild(countedGroup(count,item)));answer.appendChild(parts);
    }else if(item.choiceCounts){
      answer.classList.add("counted-choice",`${item.countedItemShape}-items`);answer.appendChild(countedGroup(item.choiceCounts[index],item));
    }else if(item.choiceImageGroups){
      const group=document.createElement("span");group.className=`choice-ball-group choice-picture-group${item.choiceImageGroups[index].length===2?" pair-group":""}`;item.choiceImageGroups[index].forEach(source=>group.appendChild(imageElement(source,"")));answer.appendChild(group);
    }else if(item.choicePatterns){
      const pair=document.createElement("span");pair.className="choice-picture-pair";item.choicePatterns[index].forEach(key=>pair.appendChild(imageElement(getMathImage(key),"")));answer.appendChild(pair);
    }else if(item.choiceImagePaths||item.choiceImages){
      answer.appendChild(imageElement(item.choiceImagePaths?.[index]||getMathImage(item.choiceImages[index]),item.choiceImageAlts?.[index]||label,"choice-picture"));
    }
    if(!item.hideChoiceLabels){const text=document.createElement("span");text.textContent=label;answer.appendChild(text)}
    const note=document.createElement("small");note.textContent="Tap to choose";answer.appendChild(note);answer.addEventListener("click",()=>choose(index));
    listen.className="choice-listen";listen.type="button";listen.setAttribute("aria-label",`Listen to ${label}`);listen.innerHTML='<span aria-hidden="true">🔊</span> Listen';listen.addEventListener("click",()=>speakOption(index,listen));
    listen.hidden=Boolean(item.choiceListenAfterAnswer);
    wrap.append(answer,listen);choices.appendChild(wrap);
  });
  requestAnimationFrame(()=>document.querySelector(".quiz-top").scrollIntoView({behavior:"auto",block:"start"}));
  preloadNextQuestion();promptTimer=setTimeout(()=>{promptTimer=null;speakQuestion()},180);
}
function choose(index){
  if(answers[current]!==undefined)return;
  const item=questions[current];if(!Number.isInteger(index)||index<0||index>=item.choices.length)return;
  answers[current]=index;const correct=index===item.answer;
  stopAllAudio();
  // Play the established answer effect, then name the selected picture.
  // Navigation or another listening action cancels this pending continuation.
  const answeredQuestion=current,answeredWeek=activeWeek;
  const feedback=playSound(correct?"correct":"wrong"),generation=answerFxGeneration;
  feedback.then(continueFeedback=>{
    if(continueFeedback&&generation===answerFxGeneration&&current===answeredQuestion&&activeWeek===answeredWeek&&answers[current]===index&&$("quiz").classList.contains("active"))speakOption(index);
  });
  document.querySelectorAll(".choice").forEach(button=>{const value=Number(button.dataset.choiceIndex);button.disabled=true;if(value===index)button.classList.add("selected",correct?"correct":"wrong");if(!correct&&value===item.answer)button.classList.add("reveal")});
  if(item.choiceListenAfterAnswer)document.querySelectorAll(".choice-listen").forEach(button=>{button.hidden=false});
  if(correct)playCorrectAnswerAnimation({...item,correctAnimation:item.correctAnimation||"picture-cheer"},index);
  $("feedback").textContent=correct?"You did it! ⭐":"Good try! The green picture shows the answer. 🌱";$("feedback").classList.add(correct?"good":"try");
  $("practice-text").textContent=item.practiceDisplay||item.practice||item.choices[item.answer];$("practice-popup").hidden=false;
  $("next-btn").textContent=current===questions.length-1?"See my results 🎉":"Next question →";$("next-btn").classList.add("show");$("quiz").classList.add("has-answer");
}
function next(){if(answers[current]===undefined)return;if(current<questions.length-1){current++;renderQuestion()}else showResults()}
function summarizeResults(bank,selections){
  const stats=Object.keys(colors).map(section=>{const indexes=bank.map((q,index)=>q.section===section?index:-1).filter(index=>index>=0);return{section,total:indexes.length,correct:indexes.filter(index=>selections[index]===bank[index].answer).length}});
  const score=stats.reduce((sum,stat)=>sum+stat.correct,0);return{score,total:bank.length,percent:Math.round(score/Math.max(1,bank.length)*100),stats};
}
function showResults(){
  showScreen("results");const result=summarizeResults(questions,answers),{score:correct,percent,stats}=result;
  lastScore=correct;dressupInitialized=false;resetRewardCard();
  const card=$("dressup-card"),config=currentDressupConfig();card.hidden=!config;document.querySelector(".results-layout").classList.toggle("no-dressup",!config);card.disabled=!config;card.classList.toggle("coming-soon",!config);card.setAttribute("aria-label",`Open the Week ${activeWeek} dress-up reward`);
  $("score-number").textContent=correct;$("score-denominator").textContent=`/ ${questions.length}`;$("percent-badge").textContent=percent+"%";
  $("student-report-name").textContent=`${student}’s Level ${REPORT_LEVEL} · Month ${REPORT_MONTH} · Week ${activeWeek} Report`;
  $("results-message").textContent=`Great job, ${student}! You finished all ${questions.length} questions.`;
  $("score-title").textContent=percent>=90?"Super learning!":percent>=70?"Champion effort!":"Keep growing!";$("score-note").textContent="Every little try helps you learn.";
  document.querySelector(".score-ring").style.background=`conic-gradient(var(--pink) ${percent*3.6}deg,#f0e7df 0deg)`;
  $("skill-chart").replaceChildren();
  stats.forEach(stat=>{
    const row=document.createElement("div"),label=document.createElement("span"),track=document.createElement("div"),fill=document.createElement("div"),score=document.createElement("b");
    row.className="skill-row";label.textContent=sectionLabels[stat.section];track.className="bar-track";fill.className="bar-fill";fill.style.background=colors[stat.section];fill.style.width=`${stat.correct/Math.max(1,stat.total)*100}%`;track.appendChild(fill);score.textContent=`${stat.correct}/${stat.total}`;row.append(label,track,score);$("skill-chart").appendChild(row);
  });
  const weakest=[...stats].sort((a,b)=>a.correct/a.total-b.correct/b.total)[0],strongest=[...stats].sort((a,b)=>b.correct/b.total-a.correct/a.total)[0];
  $("analysis-text").textContent=correct===questions.length
    ?"Wonderful learning in every area! Keep enjoying your GP stories, words, and number games."
    :correct===0
      ?"Today was a chance to explore. Revisit a few familiar pictures and words together, then try again another day. Your first answers are recorded here."
      :strongest.correct===weakest.correct
        ?"You showed a similar starting point in each area today. Enjoy a little picture, word, story, and number practice together. Your first answers are recorded here."
        :`${sectionLabels[strongest.section]} had the most correct first answers today. Revisit a few ${sectionLabels[weakest.section].toLowerCase()} activities together. These ${SECTION_TOTAL}-question sections are a brief learning snapshot.`;
  const review=$("answer-review");review.replaceChildren();questions.forEach((item,index)=>{
    const row=document.createElement("div"),mark=document.createElement("span"),copy=document.createElement("span"),heading=document.createElement("b"),selected=document.createElement("span");
    row.className="review-item";mark.textContent=answers[index]===item.answer?"✅":"🌱";heading.textContent=`${index+1}. ${sectionLabels[item.section]}`;copy.append(heading,document.createElement("br"),document.createTextNode(item.q));selected.textContent=item.choices[answers[index]]||"Not answered";row.append(mark,copy,selected);review.appendChild(row);
  });
}
function restart(){stopAllAudio();current=0;answers=[];showScreen("welcome")}
function returnToWeekSelection(){stopAllAudio();current=0;answers=[];showScreen("week-select");const url=new URL(location.href);url.searchParams.delete("week");history.replaceState(null,"",url)}
function reportFileName(){return `Level${REPORT_LEVEL}_M${REPORT_MONTH}_Week${activeWeek}_${student.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"")||"student"}_Report.png`}
async function captureReport(){
  cancelReportCapture();
  const button=$("capture-btn"),original=button.dataset.idleLabel||button.innerHTML;
  button.dataset.idleLabel=original;
  const generation=button.dataset.captureGeneration,capturedWeek=activeWeek,capturedStudent=student,filename=reportFileName();
  const current=()=>button.dataset.captureGeneration===generation&&activeWeek===capturedWeek&&student===capturedStudent&&$("results").classList.contains("active")&&!document.hidden;
  button.disabled=true;button.innerHTML="📸 Capturing…";
  let stage=null;
  try{
    if(typeof html2canvas!=="function")throw new Error("The report capture library did not load.");
    const source=$("results"),report=source.cloneNode(true);
    stage=document.createElement("div");stage.className="capture-export-stage";
    report.removeAttribute("id");report.classList.add("active","capture-export");report.style.display="block";
    stage.appendChild(report);document.body.appendChild(stage);button._gpCaptureStage=stage;
    if(document.fonts?.ready)await document.fonts.ready;
    if(!current())return;
    await Promise.all([...report.querySelectorAll("img")].map(image=>{image.loading="eager";image.decoding="sync";if(image.complete&&image.naturalWidth)return Promise.resolve();return new Promise(resolve=>{const timeout=setTimeout(resolve,10000);image.onload=image.onerror=()=>{clearTimeout(timeout);resolve()}})}));
    if(!current())return;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!current())return;
    const width=Math.ceil(report.scrollWidth),height=Math.ceil(report.scrollHeight);
    const maxPixels=16000000;
    const preferredScale=Math.min(1.5,window.devicePixelRatio||1.5);
    const safeScale=Math.min(preferredScale,Math.sqrt(maxPixels/Math.max(1,width*height)));
    const canvas=await html2canvas(report,{
      scale:Math.max(1,safeScale),width,height,
      windowWidth:Math.max(1200,width),windowHeight:Math.max(900,height),
      useCORS:true,allowTaint:false,imageTimeout:15000,
      backgroundColor:"#fff9ef",logging:false,
      onclone:clonedDocument=>{
        const clonedReport=clonedDocument.querySelector(".capture-export-stage .capture-export");
        if(clonedReport){clonedReport.classList.add("active","capture-export");clonedReport.style.display="block"}
      }
    });
    if(!current())return;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png",.95));
    if(!current())return;
    if(!blob)throw new Error("The browser could not create the report image.");
    reportBlob=blob;
    if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl=URL.createObjectURL(reportBlob);
    $("capture-image").src=reportUrl;$("capture-image").dataset.exportFileName=filename;
    $("share-note").textContent="Download it to this device or share it using an available app.";$("capture-modal").hidden=false;$("capture-close").focus();
  }catch(error){if(current()){console.error("Report capture failed:",error);alert("The report picture could not be created. Please try again.")}}
  finally{stage?.remove();if(button._gpCaptureStage===stage)button._gpCaptureStage=null;if(button.dataset.captureGeneration===generation){button.disabled=false;button.innerHTML=original}}
}
function downloadReport(){if(!reportBlob)return;const link=document.createElement("a");link.href=reportUrl;link.download=$("capture-image").dataset.exportFileName||reportFileName();link.style.display="none";document.body.appendChild(link);link.click();link.remove();$("share-note").textContent="Your report picture has been downloaded!"}
async function shareReport(){
  if(!reportBlob)return;const file=new File([reportBlob],$("capture-image").dataset.exportFileName||reportFileName(),{type:"image/png"});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({title:`${student}’s GP Weekly Report`,text:`My GP Friends Level ${REPORT_LEVEL} weekly test report`,files:[file]});$("share-note").textContent="Your report was shared!";return}catch(error){if(error.name==="AbortError")return}}
  downloadReport();$("share-note").textContent="Direct sharing is not available here, so the report was downloaded. You can attach it to any app.";
}
function closeCapture(){cancelReportCapture();$("capture-modal").hidden=true}
function rewardCountForScore(score,total){return Math.max(1,Math.min(4,Math.ceil(Math.max(0,score)/Math.max(1,total)*4)))}
function unlockedDressupCount(){return rewardCountForScore(lastScore,questions.length)}
function currentDressupConfig(){
  const config=dressupConfigs[activeWeek];
  if(!config||config.stages?.length!==5||config.items?.length!==4||config.unlockLabels?.length!==4)return null;
  if(config.stages.some(value=>typeof value!=="string"||!value)||config.items.some(item=>!item?.key||!item.image||!item.name||!item.label))return null;
  return config;
}
function resetRewardCard(){const config=currentDressupConfig(),image=document.querySelector(".dressup-gift");image.src="assets/reused/images/kids-3d-present-box.webp";image.alt="A colorful present box containing the GP Friend dress-up reward";image.classList.remove("character-reward");$("dressup-card").querySelector(".dressup-badge").textContent="NEW REWARD";$("dressup-card").querySelector(".dressup-title").textContent=config?config.cardTitle:"GP Friends Dress-Up";$("dressup-card").querySelector(".dressup-prompt").textContent="Tap to open the locker →"}
function resetDressup(){
  const config=currentDressupConfig();if(!config)return;
  if(dressupClipTimer){clearTimeout(dressupClipTimer);dressupClipTimer=null}dressupCompletedLevel=0;$("replay-clip").hidden=true;$("replay-clip").disabled=false;const video=$("dressup-celebration-video");video.dataset.rewardPlaybackSession=String((Number(video.dataset.rewardPlaybackSession)||0)+1);video.dataset.rewardPlaybackActive="";video.pause();video.removeAttribute("src");video.load();video.hidden=true;resetRewardCard();dressupApplied=0;dressupInitialized=true;$("dressup-character").src=config.stages[0];$("dressup-character").alt=config.characterAlt;$("dressup-title").textContent=config.modalTitle;
  const unlocked=unlockedDressupCount();
  $("dressup-unlock-message").textContent=`Score: ${lastScore}/${questions.length} — You unlocked ${config.unlockLabels[unlocked-1]}!`;
  $("dressup-status").textContent=`Start with the ${config.items[0].name}!`;
  document.querySelectorAll(".dressup-item").forEach((item,index)=>{const itemConfig=config.items[index],isUnlocked=index<unlocked;item.dataset.item=itemConfig.key;item.querySelector("img").src=itemConfig.image;item.querySelector("img").alt=itemConfig.alt;item.querySelector("b").textContent=itemConfig.label;item.classList.toggle("locked",!isUnlocked);item.classList.remove("applied");item.disabled=!isUnlocked;item.draggable=isUnlocked;item.setAttribute("aria-disabled",String(!isUnlocked))});
}
function openDressup(){if(!currentDressupConfig())return;if(!dressupInitialized)resetDressup();$("dressup-modal").hidden=false;$("dressup-close").focus()}
function closeDressup(){if(dressupClipTimer){clearTimeout(dressupClipTimer);dressupClipTimer=null}stopSpeech();const video=$("dressup-celebration-video"),clip=currentDressupConfig()?.clips?.[dressupCompletedLevel-1];video.dataset.rewardPlaybackSession=String((Number(video.dataset.rewardPlaybackSession)||0)+1);video.dataset.rewardPlaybackActive="";video.pause();video.hidden=true;if(dressupCompletedLevel&&clip)$("replay-clip").hidden=false;$("dressup-modal").hidden=true}
function speakDressupDialogue(config,level){
  if(config?.clipHasDialogue)return;
  const dialogue=config?.dialogues?.[level-1];if(!dialogue||!("speechSynthesis" in window))return;
  if(dressupClipTimer)clearTimeout(dressupClipTimer);
  dressupClipTimer=setTimeout(()=>{dressupClipTimer=null;stopSpeech();speakMessage(dialogue)},420);
}
function playDressupStageClip(config,level,replay=false){
  stopSpeech();
  const video=$("dressup-celebration-video"),clip=config?.clips?.[level-1],week=activeWeek;
  const session=(Number(video.dataset.rewardPlaybackSession)||0)+1;
  video.dataset.rewardPlaybackSession=String(session);video.dataset.rewardPlaybackActive=String(session);
  video.dataset.rewardStage=String(level);video.dataset.rewardWeek=String(week);
  dressupCompletedLevel=level;$("replay-clip").hidden=!replay;$("replay-clip").disabled=replay;
  if(dressupClipTimer){clearTimeout(dressupClipTimer);dressupClipTimer=null}
  video.pause();
  if(!clip){video.dataset.rewardPlaybackActive="";playSound("correct");return}
  if(!replay)video.src=clip;
  video.currentTime=0;video.hidden=true;
  const current=()=>video.dataset.rewardPlaybackSession===String(session)&&video.dataset.rewardPlaybackActive===String(session)&&activeWeek===week&&dressupCompletedLevel===level&&!$("dressup-modal").hidden&&!document.hidden;
  const showFinal=()=>{if(!current())return;video.dataset.rewardPlaybackActive="";video.hidden=true;$("replay-clip").hidden=false;$("replay-clip").disabled=false};
  // An old play promise must not restore controls or pause a newer clip.
  const stopIfAbandoned=()=>{if(!video.dataset.rewardPlaybackActive)video.pause()};
  video.onplay=()=>{if(!current())stopIfAbandoned()};
  video.onended=()=>{if(video.ended)showFinal()};
  video.onerror=()=>{if(video.error)showFinal()};
  const begin=()=>{
    if(!current())return;
    dressupClipTimer=null;video.hidden=false;
    video.play().then(()=>{if(current())speakDressupDialogue(config,level);else stopIfAbandoned()}).catch(showFinal);
  };
  // A new earned look retains its short still-image pause; replay starts directly.
  if(replay)begin();else dressupClipTimer=setTimeout(begin,1000);
}
function completeDressup(level){
  const config=currentDressupConfig(),character=$("dressup-character"),video=$("dressup-celebration-video"),rewardImage=document.querySelector(".dressup-gift");
  rewardImage.src=config.stages[level];rewardImage.alt=`${student}’s completed champion dress-up character`;rewardImage.classList.add("character-reward");$("dressup-card").querySelector(".dressup-badge").textContent="COMPLETE!";$("dressup-card").querySelector(".dressup-title").textContent=config.resultTitle||"My GP Champion Look";$("dressup-card").querySelector(".dressup-prompt").textContent="Tap to see it again →";
  video.hidden=true;$("dressup-status").textContent=level===4?"Champion look complete! You earned every item! 🏆":"Great look! Keep learning to unlock more next time! 🌟";
  playDressupStageClip(config,level);
}
function replayDressupClip(){const config=currentDressupConfig(),clip=config?.clips?.[dressupCompletedLevel-1];if(!dressupCompletedLevel||!clip)return;playDressupStageClip(config,dressupCompletedLevel,true)}
function applyDressup(itemName){
  const config=currentDressupConfig(),item=document.querySelector(`.dressup-item[data-item="${itemName}"]`);if(!config||!item||item.classList.contains("locked")||item.classList.contains("applied"))return;
  const order=Number(item.dataset.order);if(order!==dressupApplied){$("dressup-status").textContent=`Try the ${config.items[dressupApplied].name} first!`;return}
  dressupApplied++;item.classList.add("applied");item.draggable=false;$("dressup-character").src=config.stages[dressupApplied];$("dressup-character").alt=`The GP Friend wearing ${config.items.slice(0,dressupApplied).map(entry=>entry.name).join(", ")}`;
  const unlocked=unlockedDressupCount();if(dressupApplied===unlocked)completeDressup(unlocked);else{playSound("correct");$("dressup-status").textContent=`Great! Now add the ${config.items[dressupApplied].name}.`}
}

REPORT_WEEKS.forEach(data=>{
  const button=$(`week-${data.week}-btn`);button.querySelector(".week-card-copy strong").textContent=data.title;
  const hero=button.querySelector("img");hero.src=data.hero;hero.alt="";button.addEventListener("click",()=>selectWeek(data.week));
});
$("all-weeks-btn").addEventListener("click",returnToWeekSelection);
$("home-logo").addEventListener("click",event=>{event.preventDefault();playSound("click");if($("week-select").classList.contains("active"))return;if(!$("quiz").classList.contains("active")||confirm("Go back to the weekly selection? Your answers will be cleared."))returnToWeekSelection()});
$("start-btn").addEventListener("click",start);$("student-name").addEventListener("keydown",event=>{if(event.key==="Enter")start()});$("next-btn").addEventListener("click",next);$("restart-btn").addEventListener("click",restart);
$("quit-btn").addEventListener("click",()=>{if(confirm("Go back to the weekly selection? Your answers will be cleared."))returnToWeekSelection()});$("practice-replay").addEventListener("click",playPractice);$("question-listen-btn").addEventListener("click",speakQuestion);
$("dressup-card").addEventListener("click",openDressup);$("dressup-close").addEventListener("click",closeDressup);$("dressup-reset").addEventListener("click",resetDressup);$("replay-clip").addEventListener("click",replayDressupClip);$("dressup-modal").addEventListener("click",event=>{if(event.target===$("dressup-modal"))closeDressup()});
document.querySelectorAll(".dressup-item").forEach(item=>{item.addEventListener("click",()=>applyDressup(item.dataset.item));item.addEventListener("dragstart",event=>{if(item.classList.contains("locked")){event.preventDefault();return}event.dataTransfer.setData("text/plain",item.dataset.item);event.dataTransfer.effectAllowed="move"})});
$("character-dropzone").addEventListener("dragover",event=>{event.preventDefault();event.currentTarget.classList.add("drag-over");event.dataTransfer.dropEffect="move"});$("character-dropzone").addEventListener("dragleave",event=>event.currentTarget.classList.remove("drag-over"));$("character-dropzone").addEventListener("drop",event=>{event.preventDefault();event.currentTarget.classList.remove("drag-over");applyDressup(event.dataTransfer.getData("text/plain"))});
$("capture-btn").addEventListener("click",captureReport);$("download-capture").addEventListener("click",downloadReport);$("share-capture").addEventListener("click",shareReport);$("capture-close").addEventListener("click",closeCapture);$("capture-modal").addEventListener("click",event=>{if(event.target===$("capture-modal"))closeCapture()});
$("print-btn").addEventListener("click",()=>window.print());
document.addEventListener("click",event=>{const button=event.target.closest("button");if(button&&!button.matches(".choice,.choice-listen,.question-listen,#practice-replay"))playSound("click")},true);
document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;if(!$("capture-modal").hidden)closeCapture();if(!$("dressup-modal").hidden)closeDressup()});
document.addEventListener("visibilitychange",()=>{if(document.hidden){stopAllAudio();cancelReportCapture()}});
window.addEventListener("pagehide",()=>{stopAllAudio();closeCapture();if(reportUrl)URL.revokeObjectURL(reportUrl);reportUrl="";reportBlob=null});
const requestedWeek=Number(new URLSearchParams(location.search).get("week"));
if(REPORT_WEEKS.some(data=>Number(data.week)===requestedWeek))selectWeek(requestedWeek);
// Pure scoring helpers also serve the local QA checks; they never change a learner's answers.
window[`Level${REPORT_LEVEL}ReportScoring`]=Object.freeze({summarize:summarizeResults,rewardCount:rewardCountForScore});
