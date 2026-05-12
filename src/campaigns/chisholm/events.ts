import type { GameEvent } from "../types";

export const EVENTS: GameEvent[] = [
{id:"river_crossing_early",phase_min:0,phase_max:0.3,weight:5,title:"River Crossing — The Brazos",text:"You reach the flooded Brazos River. A bad crossing can drown cattle, lose horses, and slow your drive.",trivia:["Trail drives often paused at rivers because one bad crossing could scatter a herd.","Historians think scouts tested water depth on horseback before moving cattle."],sageAdvice:[{name:"Nina",role:"Trail scout",line:"Watch the current first. Fast water can pull calves away from the herd."},{name:"Mr. Redford",role:"Old trail hand",line:"A slower crossing can save many cattle. Patience is a trail skill."}],choices:[{text:"Take the wide ford. Half a day lost but safer.",outcomes:[{weight:6,effects:{herdCondition:-2},result:"The wide ford works. Water up to the cattle’s bellies but they cross steady. Boring success — the best kind."},{weight:4,effects:{herd:-30,herdCondition:-4,horses:-2},result:"The ‘safe’ ford has a sinkhole. Thirty head drown. Two horses go down."}]},{text:"Cross here. Deep but narrow — fast.",outcomes:[{weight:5,effects:{herd:-60,morale:-6,horses:-3},result:"Too deep. Current catches the middle of the herd. Sixty head gone."},{weight:5,effects:{herd:-8,morale:4},result:"Your lead steer walks straight in and the herd follows. Eight head swept away."}]},{text:"Wait a day. Let the river drop.",outcomes:[{weight:5,effects:{supplies:-4,herdCondition:3,herd:-5},result:"River drops overnight. Easy crossing. Patience pays."},{weight:5,effects:{supplies:-4,herd:-80,morale:-8},result:"It rains again. River rises. Eighty head gone."}]}]},
{id:"stampede_night",phase_min:0,phase_max:0.8,weight:5,title:"Stampede — Lightning",text:"Lightning hits near camp at night. If the herd stampedes, you can lose cattle, riders, and distance.",choices:[{text:"Ride to the front. Turn the leaders.",outcomes:[{weight:5,effects:{herd:-40,horses:-2,morale:-3},result:"You turn them into a wide circle by dawn. Forty head over a bluff."},{weight:3,effects:{herd:-15,morale:5,herdCondition:-3},result:"Your best rider turns the lead steer hard. Fifteen scattered. The crew cheers loudly."},{weight:2,effects:{herd:-20,crew:-1,morale:-10,horses:-1},result:"A horse hits a prairie dog hole at full gallop in the dark. Horse and rider go down."}]},{text:"Hold position. Protect the camp.",effects:{herd:-150,morale:-5},result:"You let them run. A hundred fifty head just gone."},{text:"Get every rider out singing.",outcomes:[{weight:4,effects:{herd:-20,morale:3,herdCondition:-2},result:"Cowboys singing ‘Lorena’ in a thunderstorm. Twenty head gone but the herd settles."},{weight:6,effects:{herd:-100,morale:-6,herdCondition:-5},result:"Too far gone. Herd splits three ways. A hundred head scattered."}]}]},
{id:"water_scarce",phase_min:0.2,phase_max:0.7,weight:5,title:"Dry Country",text:"You have gone two days without water. If you guess wrong now, cattle and horses can die fast.",choices:[{text:"Push through fast.",outcomes:[{weight:5,effects:{herd:-50,herdCondition:-8,morale:-4,horses:-3},result:"Cattle stagger. Calves drop. Fifty head didn’t make it."},{weight:5,effects:{herd:-20,herdCondition:-4,morale:3},result:"Scout signals river ahead by evening. Twenty lost to heat. The rest drink."}]},{text:"Slow down. Look for water.",outcomes:[{weight:4,effects:{supplies:-6,herd:-30,herdCondition:-3,morale:-5},result:"Extra day of suffering. Thirty dead."},{weight:6,effects:{herdCondition:-2,supplies:-3,herd:-8,morale:4},result:"Scout finds an underground seep. Eight head lost."}]},{text:"Night drive. Move in the cool.",outcomes:[{weight:5,effects:{herd:-25,morale:-5,herdCondition:-3},result:"Twenty-five walk off a cutbank in the dark."},{weight:5,effects:{herd:-10,morale:2,herdCondition:1,horses:-1},result:"It works. By dawn you see trees — water."}]}]},
{id:"rustlers",phase_min:0.3,phase_max:0.8,weight:4,title:"Riders on the Ridge",text:"Unknown riders shadow your herd. If trouble starts, you may lose cattle, gear, or crew health.",choices:[{text:"Arm up and ride out.",outcomes:[{weight:5,effects:{morale:5,herdCondition:-2},result:"They are another trail crew, not rustlers. Morale rises."},{weight:5,effects:{morale:-3,crew:-1,supplies:-2},result:"They scatter but one puts a rifle shot through your flank rider’s shoulder."}]},{text:"Circle tight and post guards.",effects:{herdCondition:-4,morale:-3,supplies:-2},result:"They disappear at sundown. You’ll never know what they were."},{text:"Ignore them. Keep driving.",outcomes:[{weight:4,effects:{herd:-200,morale:-12,horses:-4},result:"They hit at dawn. 200 head gone."},{weight:6,effects:{morale:2},result:"They drift away by evening, and danger passes."}]}]},
{id:"crew_quit",phase_min:0.3,phase_max:0.7,weight:4,title:"Two Hands Give Notice",text:"Two hands want to quit before dawn. Fewer riders means slower travel and weaker herd control.",choices:[{text:"Let them go.",effects:{crew:-2,morale:-3},result:"They ride out at dawn."},{text:"Offer double wages.",outcomes:[{weight:6,effects:{supplies:-5,morale:3},result:"Double pay keeps them."},{weight:4,effects:{crew:-2,morale:-6},result:"‘It is not about money.’"}]},{text:"Remind them they signed a contract.",effects:{morale:-8},result:"They stay, but morale drops and teamwork suffers."}]},
{id:"indian_territory",phase_min:0.4,phase_max:0.7,weight:5,title:"Indian Territory",text:"You enter Nations land and must pay a legal toll. The choice affects herd safety and supplies.",choices:[{text:"Pay the toll. It’s their land.",effects:{morale:-3,herdCondition:2,herd:-250},result:"250 head equivalent. The toll bought intelligence and escort."},{text:"Negotiate. Offer five cents.",outcomes:[{weight:5,effects:{morale:1,herdCondition:1,herd:-175},result:"Seven cents. 175 head. Fair."},{weight:5,effects:{morale:-5,herdCondition:-3,herd:-50,supplies:-4},result:"No escort. Bad crossing. The toll was cheaper than ignorance."}]},{text:"Refuse. Push through.",outcomes:[{weight:3,effects:{morale:4,herdCondition:-4},result:"No attack comes, but your crew stays tense and tired."},{weight:7,effects:{herd:-300,morale:-8,horses:-5,crew:-1,herdCondition:-6},result:"Ambush at a river crossing. 300 head gone. A cowboy takes an arrow."}]}]},
{id:"cook_wagon",phase_min:0.1,phase_max:0.6,weight:4,title:"Busted Axle",text:"Your chuck wagon axle breaks. Without food and tools, morale drops and repairs cost time.",choices:[{text:"Full stop. Repair. Whole day.",effects:{supplies:-3,herdCondition:-3,morale:1},result:"Cottonwood replacement axle. The cook makes coffee and the crew forgives."},{text:"Rig a temporary fix.",outcomes:[{weight:5,effects:{morale:-2,supplies:-2},result:"Holds three days then fails in a creek. Half your flour ruined."},{weight:5,effects:{morale:2},result:"Holds all the way. Sometimes the quick fix is the right fix."}]},{text:"Abandon the wagon.",effects:{supplies:-15,morale:-10,horses:-3},result:"Cold jerky and creek water for every meal. This is survival now."}]},
{id:"good_grass",phase_min:0.1,phase_max:0.8,weight:3,title:"Paradise Valley",text:"Your scout finds rich grass and clean water. Resting helps herd health but costs precious days.",choices:[{text:"Two days’ rest.",effects:{herdCondition:10,morale:6,supplies:-5,horses:2},result:"The herd recovers well, and the crew feels strong again."},{text:"One day.",effects:{herdCondition:5,morale:3,supplies:-3},result:"Enough to take the edge off."},{text:"Keep moving.",outcomes:[{weight:5,effects:{morale:-6,herdCondition:-2},result:"The crew is disappointed as you move on."},{weight:5,effects:{morale:-3,herdCondition:-1},result:"Soon after, a crossing appears and morale steadies."}]}]},
{id:"river_red",phase_min:0.35,phase_max:0.55,weight:5,title:"The Red River",text:"You face the wide Red River. A poor plan can sweep cattle away and ruin your schedule.",choices:[{text:"Scout downstream.",outcomes:[{weight:5,effects:{supplies:-4,herd:-15,herdCondition:-1},result:"Better crossing found. Fifteen lost. Patience paid."},{weight:5,effects:{supplies:-6,morale:-3,herd:-40},result:"Nothing better. Forty head gone."}]},{text:"Cross here and now.",outcomes:[{weight:4,effects:{herd:-80,morale:-6,horses:-4,crew:-1},result:"The crossing turns chaotic. You lose eighty head and one rider."},{weight:6,effects:{herd:-25,morale:4},result:"The lead steer holds course. You lose twenty-five head but cross safely."}]},{text:"Wait for another outfit. Watch and learn.",outcomes:[{weight:5,effects:{supplies:-5,herd:-10,morale:2},result:"Watch their mistakes. Cross clean. Ten head — a miracle for the Red."},{weight:5,effects:{supplies:-8,morale:-5,herdCondition:-3},result:"No one arrives. You lose two days and supplies."}]}]},
{id:"snakebite",phase_min:0,phase_max:0.8,weight:3,title:"Rattler",text:"A snake bites your best roper. Treatment choice affects crew health and herd control.",choices:[{text:"Cut and suck.",outcomes:[{weight:5,effects:{morale:-3,crew:-1},result:"The treatment fails, and you lose a crew member."},{weight:5,effects:{morale:2,herdCondition:-2},result:"By day four, he can sit up and recover slowly."}]},{text:"Send a rider for medicine.",effects:{crew:-1,morale:-2,herdCondition:-3,supplies:-4},result:"You are short on riders, and the medicine comes too late."},{text:"Tourniquet, whiskey, chuck wagon.",effects:{morale:-1,herdCondition:-2},result:"He makes it. Barely. He’ll tell this story for fifty years."}]},
{id:"tornado",phase_min:0.2,phase_max:0.7,weight:3,title:"Green Sky",text:"Dark clouds spin on the horizon. You have minutes to protect crew, horses, and herd.",choices:[{text:"Scatter the herd.",outcomes:[{weight:5,effects:{herd:-60,morale:-4,herdCondition:-5},result:"Twister hits where the herd was. Sixty gone but the bulk survived."},{weight:5,effects:{herd:-30,morale:4},result:"Misses by a mile. Too close."}]},{text:"Hold tight. Low ground.",outcomes:[{weight:4,effects:{herd:-200,crew:-1,horses:-6,morale:-12},result:"Direct hit. 200 gone. A cowboy thrown."},{weight:6,effects:{herd:-20,morale:2,herdCondition:-3},result:"Low ground saves you. Twenty caught. Lucky everything."}]},{text:"Ride south.",effects:{herd:-40,herdCondition:-6,morale:-5,supplies:-3},result:"Cattle fight you every step. Forty scatter. But you’re alive."}]},
{id:"competition",phase_min:0.3,phase_max:0.8,weight:3,title:"Competition",text:"A larger herd races toward Abilene. Arriving late could lower your sale price and final score.",choices:[{text:"Push hard. Outpace them.",effects:{herdCondition:-8,morale:-3,supplies:-5,horses:-3},result:"Cattle drop weight. But you pull ahead."},{text:"Hold pace. Fat cattle sell higher.",outcomes:[{weight:6,effects:{morale:-2},result:"They pass you. But your cattle are fat."},{weight:4,effects:{morale:3},result:"They push too hard. Stampede. Tortoise and the hare."}]},{text:"Send a rider to lock in a price.",effects:{crew:-1,morale:2},result:"Sharpest man, fastest horse, letter of intent."}]},
{id:"prairie_fire",phase_min:0.1,phase_max:0.6,weight:3,title:"Smoke on the Horizon",text:"A prairie fire moves toward your trail. Wrong timing can trap cattle in smoke and heat.",choices:[{text:"Set a backfire.",outcomes:[{weight:6,effects:{herd:-20,herdCondition:-3,morale:2},result:"Scout burns a strip. Twenty bolt. Professional work."},{weight:4,effects:{herd:-80,morale:-6,herdCondition:-5},result:"Backfire gets away. Fire on TWO sides. Eighty gone."}]},{text:"Drive east. Outflank it.",effects:{herdCondition:-5,morale:-3,supplies:-3,herd:-15},result:"Fire slides past. Fifteen scatter."},{text:"Find water.",outcomes:[{weight:4,effects:{herd:-5,morale:5,herdCondition:2},result:"Wide creek. Herd stands belly-deep while the world burns."},{weight:6,effects:{herd:-40,morale:-4,herdCondition:-4},result:"No creek. Forty head lost in the smoke."}]}]},
{id:"buyer",phase_min:0.7,phase_max:0.95,weight:4,title:"A Buyer on the Trail",text:"A buyer offers cash today at a lower price. Waiting may earn more, but risk grows each day.",choices:[{text:"Take the deal.",effects:{morale:8},result:"$30 a head. You left $25,000 on the table. But you’re done.",earlyEnd:true},{text:"Counter at $35.",outcomes:[{weight:5,effects:{morale:6},result:"‘$33.’ Done today.",earlyEnd:true},{weight:5,effects:{morale:-2},result:"‘$30 is the offer.’ He rides on."}]},{text:"Refuse.",outcomes:[{weight:5,effects:{morale:4},result:"‘Your herd, your call.’"},{weight:5,effects:{morale:-3},result:"That night a hand says Abilene prices dropped to $28."}]}]},
{id:"horse_thief",phase_min:0.2,phase_max:0.6,weight:3,title:"Missing Horses",text:"Eight horses are missing at dawn. Without mounts, scouts and guards cannot cover the herd.",choices:[{text:"Send riders after them.",outcomes:[{weight:5,effects:{morale:4,herdCondition:-3},result:"Horses back. One cowboy shot in the arm."},{weight:5,effects:{horses:-8,morale:-2,herdCondition:-4},result:"Lost the trail. Eight horses gone."}]},{text:"Let them go.",effects:{horses:-8,morale:-6},result:"A trail boss who won’t fight for his remuda."},{text:"Double the watch.",effects:{horses:-8,morale:-4,herdCondition:-2},result:"Horses are safer, but the crew grows very tired."}]},
{id:"fever",phase_min:0.25,phase_max:0.7,weight:3,title:"Tick Fever",text:"Tick fever appears in your herd. Act now, or sickness spreads and many cattle die.",choices:[{text:"Cut the sick ones.",effects:{herd:-36,morale:-2,herdCondition:4},result:"Thirty-six left standing. The fever stops."},{text:"Treat on the move.",outcomes:[{weight:5,effects:{herd:-100,herdCondition:-8,morale:-6,supplies:-4},result:"The fever spreads. You lose one hundred head."},{weight:5,effects:{herd:-15,herdCondition:-2,supplies:-4},result:"The treatment helps some cattle, but fifteen are lost."}]},{text:"Push hard. Outrun the ticks.",effects:{herdCondition:-6,herd:-50,morale:-4,horses:-2},result:"The disease keeps spreading, and fifty cattle die."}]},
{
  id: "stray_longhorns",
  phase_min: 0.1,
  phase_max: 0.8,
  weight: 6,
  type: "push_luck",
  title: "Stray Longhorns in the Brush",
  text: "Scout spotted a dozen unbranded longhorns deep in a thicket of mesquite and prickly pear. Pulling them out will take time, and the brush is thick with rattlers and broken ground.",
  leaveText: "Leave them. We have enough trouble.",
  attempts: [
    {
      id: "stray_1",
      buttonText: "Rope the easy ones on the edge",
      successText: "Got three head without much fuss. Added to the herd.",
      failureText: "A steer bolted and caught a horse in the ribs. Had to let them go.",
      riskChance: 0.10,
      rewards: { herd: 3, morale: 2 },
      penalties: { horses: -1, morale: -2 }
    },
    {
      id: "stray_2",
      buttonText: "Push deeper into the thicket",
      successText: "Hauled out five more. The crew is getting scratched to hell, but it's free money.",
      failureText: "Rattlesnake spooked a horse. Rider thrown into a cactus, horse lame. Total mess.",
      riskChance: 0.35,
      rewards: { herd: 5, morale: 5 },
      penalties: { horses: -1, herdCondition: -5, morale: -8 }
    },
    {
      id: "stray_3",
      buttonText: "Dismount and flush out the last few",
      successText: "Dragged the last four out by their horns. A perfect haul, worth an extra $160 in Abilene.",
      failureText: "Ambushed by a feral bull hiding in the brush. One cowboy gored, two horses scattered. A disaster.",
      riskChance: 0.65,
      rewards: { herd: 4, morale: 10 },
      penalties: { crew: -1, horses: -2, morale: -15, herdCondition: -10 }
    }
  ]
},
{
  id: "abandoned_homestead",
  phase_min: 0.2,
  phase_max: 0.7,
  weight: 5,
  type: "push_luck",
  title: "Abandoned Homestead",
  text: "Your scout found a homestead that's been empty since the war. The root cellar door is still shut, and there's a corral out back with what looks like a few stray horses. Could be supplies in there — could be trouble.",
  leaveText: "Leave it. Other men's property, other men's problems.",
  attempts: [
    {
      id: "homestead_1",
      buttonText: "Check the corral for horses",
      successText: "Two sound horses, abandoned and half-wild. Your wrangler ropes them clean.",
      failureText: "A longhorn kicks your wrangler. You gain nothing and lose morale.",
      riskChance: 0.15,
      rewards: { horses: 2, morale: 3 },
      penalties: { morale: -3, herdCondition: -2 }
    },
    {
      id: "homestead_2",
      buttonText: "Pry open the root cellar",
      successText: "You find salt pork, dried beans, and coffee. The camp has enough food again.",
      failureText: "The door was wedged for a reason — a rattlesnake den. One cowboy bitten before you slam it shut.",
      riskChance: 0.40,
      rewards: { supplies: 12, morale: 8 },
      penalties: { crew: -1, morale: -6 }
    },
    {
      id: "homestead_3",
      buttonText: "Search the house itself",
      successText: "A hidden strongbox under the floorboards. Gold coins, a Winchester, and a letter that'll never reach anyone. Fortune favors the bold.",
      failureText: "The floor gives way. A cowboy falls through into a collapsed cellar. Broken leg, broken morale, broken everything.",
      riskChance: 0.70,
      rewards: { supplies: 8, morale: 15, herd: 5 },
      penalties: { crew: -1, horses: -1, morale: -12, herdCondition: -8 }
    }
  ]
},
];
