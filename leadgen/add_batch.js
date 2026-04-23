// Batch add leads from search agents
const { addLead, loadLeads } = require('./scraper');

const newLeads = [
  // DENTAL (20)
  {email:"contact@universitydental.co.uk",business:"University Dental & Implant Centre",industry:"dental",website:"https://universitydental.co.uk/",source:"websearch"},
  {email:"sellyoak@dentalpartners.co.uk",business:"Selly Oak Dental Practice",industry:"dental",website:"https://rodericksdentalpartners.co.uk/",source:"websearch"},
  {email:"info@hillbrookdental.com",business:"Hillbrook Dental Health Centre",industry:"dental",website:"https://www.hillbrookdental.com/",source:"websearch"},
  {email:"info@leedscitydentalcare.co.uk",business:"Leeds City Dentalcare",industry:"dental",website:"https://www.leedscitydentalcare.co.uk/",source:"websearch"},
  {email:"info@leedsdentalclinic.co.uk",business:"Leeds Dental Clinic",industry:"dental",website:"https://www.leedsdentalclinic.co.uk/",source:"websearch"},
  {email:"highashdental@gmail.com",business:"High Ash Dental Surgery",industry:"dental",website:"https://www.highashdental.co.uk/",source:"websearch"},
  {email:"info@northleedsdental.com",business:"North Leeds Dental Clinic",industry:"dental",website:"https://www.northleedsdental.com",source:"websearch"},
  {email:"info@smileclinicleeds.com",business:"Aesthetique Dental Care",industry:"dental",website:"https://aesthetique.me.uk/",source:"websearch"},
  {email:"reception@melioradental.co.uk",business:"Meliora Dental Clinic",industry:"dental",website:"https://www.melioradental.co.uk/",source:"websearch"},
  {email:"info@infinitydentalclinic.co.uk",business:"Infinity Dental Clinic",industry:"dental",website:"https://infinitydentalclinic.co.uk/",source:"websearch"},
  {email:"menlove.avenue@rodericksdental.co.uk",business:"Menlove Dental Surgery",industry:"dental",website:"https://rodericksdentalpartners.co.uk/",source:"websearch"},
  {email:"sheilroad@rodericksdental.co.uk",business:"Sheil Road Dental Practice",industry:"dental",website:"https://rodericksdentalpartners.co.uk/",source:"websearch"},
  {email:"reception@primadentdental.co.uk",business:"Primadent Cosmetic Dentists",industry:"dental",website:"https://www.primadentdental.co.uk/",source:"websearch"},
  {email:"info@hxdental.co.uk",business:"HX Dental",industry:"dental",website:"https://www.hxdental.co.uk/",source:"websearch"},
  {email:"info@henleazedental.co.uk",business:"Henleaze Dental Practice",industry:"dental",website:"https://www.henleazedental.co.uk/",source:"websearch"},
  {email:"info@beaumondedental.co.uk",business:"Beau Monde Dental Care",industry:"dental",website:"https://www.beaumondedental.co.uk/",source:"websearch"},
  {email:"info@cliftonsmiles.co.uk",business:"Clifton Dental Studio",industry:"dental",website:"https://www.cliftonsmiles.com/",source:"websearch"},
  {email:"reception@highstreetdental.co.uk",business:"High Street Dental Clinic",industry:"dental",website:"https://www.highstreetdental.co.uk/",source:"websearch"},
  {email:"hello@bristoldentalsuite.co.uk",business:"Bristol Dental Suite",industry:"dental",website:"https://www.bristoldentalsuite.co.uk/",source:"websearch"},
  {email:"info@thebristoldentist.co.uk",business:"The Bristol Dental Practice",industry:"dental",website:"https://thebristoldentist.co.uk/",source:"websearch"},

  // LAW (16 new)
  {email:"sam.siddle@weightmans.com",business:"Weightmans Manchester",industry:"law",website:"https://www.weightmans.com",contactName:"Samantha",source:"websearch"},
  {email:"hello@brabners.com",business:"Brabners Solicitors",industry:"law",website:"https://www.brabners.com",source:"websearch"},
  {email:"enquiries@jmw.co.uk",business:"JMW Solicitors",industry:"law",website:"https://www.jmw.co.uk",source:"websearch"},
  {email:"getintouch@clarkewillmott.com",business:"Clarke Willmott",industry:"law",website:"https://www.clarkewillmott.com",source:"websearch"},
  {email:"enquiries@monarchsolicitors.com",business:"Monarch Solicitors",industry:"law",website:"https://www.monarchsolicitors.com",source:"websearch"},
  {email:"lawyers@lodders.co.uk",business:"Lodders Solicitors",industry:"law",website:"https://www.lodders.co.uk",source:"websearch"},
  {email:"newenquiries@talbotslaw.co.uk",business:"Talbots Law",industry:"law",website:"https://www.talbotslaw.co.uk",source:"websearch"},
  {email:"help@gtstewart.co.uk",business:"GT Stewart Solicitors",industry:"law",website:"https://gtstewart.co.uk",source:"websearch"},
  {email:"info@levisolicitors.co.uk",business:"Levi Solicitors LLP",industry:"law",website:"https://levisolicitors.co.uk",source:"websearch"},
  {email:"property@henryhyams.com",business:"Henry Hyams Solicitors",industry:"law",website:"https://henryhyams.com",source:"websearch"},
  {email:"help@switalskis.com",business:"Switalskis Solicitors",industry:"law",website:"https://www.switalskis.com",source:"websearch"},
  {email:"info@otssolicitors.co.uk",business:"OTS Solicitors",industry:"law",website:"https://www.otssolicitors.co.uk",source:"websearch"},
  {email:"info@adambernards.co.uk",business:"Adam Bernards Solicitors",industry:"law",website:"https://adambernards.co.uk",source:"websearch"},
  {email:"contact@glsolicitors.com",business:"Greater London Solicitors",industry:"law",website:"https://www.glsolicitors.com",source:"websearch"},
  {email:"contactus@hja.net",business:"Hodge Jones & Allen",industry:"law",website:"https://www.hja.net",source:"websearch"},
  {email:"info@emlaw.co.uk",business:"EM Law",industry:"law",website:"https://emlaw.co.uk",source:"websearch"},

  // ESTATE AGENTS (14 new)
  {email:"hello@themanchesteragent.co.uk",business:"The Manchester Estate Agent",industry:"realestate",website:"https://www.themanchesteragent.co.uk",source:"websearch"},
  {email:"info@manlets.com",business:"Manlets Residential Lettings",industry:"realestate",website:"https://manlets.com",source:"websearch"},
  {email:"info@lettingagentproperties.com",business:"The Letting Agent Manchester",industry:"realestate",website:"https://www.lettingagentproperties.com",source:"websearch"},
  {email:"manchester@leaders.co.uk",business:"Leaders Manchester",industry:"realestate",website:"https://www.leaders.co.uk",source:"websearch"},
  {email:"manchestersales@reedsrains.co.uk",business:"Reeds Rains Manchester",industry:"realestate",website:"https://www.reedsrains.co.uk",source:"websearch"},
  {email:"info@cityends.com",business:"Cityends Group",industry:"realestate",website:"http://www.cityends.com",source:"websearch"},
  {email:"hello@lvproperty.co.uk",business:"LV Property",industry:"realestate",website:"https://www.lvproperty.co.uk",source:"websearch"},
  {email:"info@oakmans.co.uk",business:"Oakmans Estate Agents",industry:"realestate",website:"https://www.oakmans.co.uk",source:"websearch"},
  {email:"birminghamcity@connells.co.uk",business:"Connells Birmingham",industry:"realestate",website:"https://www.connells.co.uk",source:"websearch"},
  {email:"hello@balloonlets.co.uk",business:"Balloon Letting Company",industry:"realestate",website:"https://www.balloonlets.co.uk",source:"websearch"},
  {email:"bishopston@elephantlovesbristol.co.uk",business:"Elephant Estate Agents Bristol",industry:"realestate",website:"https://www.elephantlovesbristol.co.uk",source:"websearch"},
  {email:"info@boardwalkpropertyco.com",business:"Boardwalk Property Co",industry:"realestate",website:"https://www.boardwalkpropertyco.com",source:"websearch"},
  {email:"clifton@allenandharris.co.uk",business:"Allen & Harris Clifton",industry:"realestate",website:"https://www.allenandharris.co.uk",source:"websearch"},
  {email:"info@choices.co.uk",business:"Choices Estate Agents",industry:"realestate",website:"https://www.choices.co.uk",source:"websearch"},

  // RESTAURANTS (9 new)
  {email:"manchester@dimitris.co.uk",business:"Dimitris Restaurant",industry:"restaurant",website:"https://www.dimitris.co.uk",source:"websearch"},
  {email:"giorgiosmanchester@gmail.com",business:"Giorgios Italian Restaurant",industry:"restaurant",website:"https://giorgiosmanchester.com",source:"websearch"},
  {email:"enquiries@sancarlo.co.uk",business:"San Carlo",industry:"restaurant",website:"https://sancarlo.co.uk",source:"websearch"},
  {email:"manchester@maray.co.uk",business:"Maray Restaurant",industry:"restaurant",website:"https://maray.co.uk",source:"websearch"},
  {email:"leeds@therestaurantbarandgrill.com",business:"Restaurant Bar & Grill Leeds",industry:"restaurant",website:"https://therestaurantbarandgrill.com",source:"websearch"},
  {email:"leeds@olivetreebrasserie.co.uk",business:"Olive Tree Brasserie Leeds",industry:"restaurant",website:"https://olivetreebrasserie.co.uk",source:"websearch"},
  {email:"leeds@rivablu.co.uk",business:"Riva Blu Leeds",industry:"restaurant",website:"https://rivablu.co.uk",source:"websearch"},
  {email:"info@kendellsbistro.co.uk",business:"Kendells Bistro",industry:"restaurant",website:"https://kendellsbistro.co.uk",source:"websearch"},
  {email:"enquiriesleeds@ambiente-tapas.co.uk",business:"Ambiente Tapas Leeds",industry:"restaurant",website:"https://www.ambiente-tapas.co.uk",source:"websearch"},

  // FITNESS (10 new)
  {email:"hello@thegymgroup.com",business:"The Gym Group",industry:"fitness",website:"https://www.thegymgroup.com",source:"websearch"},
  {email:"info@igym.london",business:"iGym London",industry:"fitness",website:"https://igym.london",source:"websearch"},
  {email:"info@welcomegym.co.uk",business:"Welcome Gym",industry:"fitness",website:"https://www.welcomegym.co.uk",source:"websearch"},
  {email:"hello@axiom.fit",business:"AXIOM Boutique Gym",industry:"fitness",website:"https://axiom.fit",source:"websearch"},
  {email:"birmingham@mkhealthhub.co.uk",business:"MK Healthhub Birmingham",industry:"fitness",website:"https://mkhealthhub.co.uk",source:"websearch"},
  {email:"info@ultimatefitnessbirmingham.co.uk",business:"Ultimate Fitness Birmingham",industry:"fitness",website:"https://ultimatefitnessbirmingham.co.uk",source:"websearch"},
  {email:"info@personalspacetraining.co.uk",business:"Personal Space Training Studio",industry:"fitness",website:"https://personalspacetraining.co.uk",source:"websearch"},
  {email:"hello@strengthlabbristol.co.uk",business:"StrengthLab Bristol",industry:"fitness",website:"https://strengthlabbristol.co.uk",source:"websearch"},
  {email:"danny@opexbristol.com",business:"OPEX Bristol",industry:"fitness",website:"https://www.opexbristol.com",contactName:"Danny",source:"websearch"},
  {email:"info@onefitlife.co.uk",business:"Onelife PT & Massage",industry:"fitness",website:"https://onefitlife.co.uk",source:"websearch"},

  // TRADES (21 new)
  {email:"info@staunchandflow.co.uk",business:"Staunch & Flow Plumbers",industry:"trades",website:"https://london-plumber.co.uk/",source:"websearch"},
  {email:"enquiries@pulseplumbers.co.uk",business:"Pulse Plumbing & Heating",industry:"trades",website:"https://www.pulseplumbers.co.uk/",source:"websearch"},
  {email:"info@innercityplumbers.com",business:"Innercity Plumbers Ltd",industry:"trades",website:"https://www.plumbingheatinglondon.co.uk/",source:"websearch"},
  {email:"info@mylondonplumbers.co.uk",business:"My London Plumbers",industry:"trades",website:"https://www.mylondonplumbers.co.uk/",source:"websearch"},
  {email:"hello@happydogplumbing.london",business:"Happy Dog Plumbing",industry:"trades",website:"https://happydogplumbing.london/",source:"websearch"},
  {email:"installations@pimlicoplumbers.com",business:"Pimlico Plumbers",industry:"trades",website:"https://www.pimlicoplumbers.com/",source:"websearch"},
  {email:"enquiries@myplumberman.co.uk",business:"My Plumber Man",industry:"trades",website:"http://myplumberman.co.uk/",source:"websearch"},
  {email:"info.ukhp@gmail.com",business:"UK Heating & Plumbing",industry:"trades",website:"https://ukheatingandplumbing.com/",source:"websearch"},
  {email:"ask@manchesterelectric.co.uk",business:"Manchester Electric Ltd",industry:"trades",website:"https://www.manchesterelectric.co.uk/",source:"websearch"},
  {email:"info@celectrical.com",business:"Central Electrical Contractors",industry:"trades",website:"https://celectrical.com/",source:"websearch"},
  {email:"info@m-ei.co.uk",business:"Manchester Electrical Services",industry:"trades",website:"https://m-ei.co.uk/",source:"websearch"},
  {email:"info@manchestercompliance.co.uk",business:"Manchester Compliance",industry:"trades",website:"https://www.manchestercompliance.co.uk/",source:"websearch"},
  {email:"enquiries@dcelectricalservices.co.uk",business:"DC Electrical Services",industry:"trades",website:"https://www.dcelectricalservices.co.uk/",source:"websearch"},
  {email:"hbk.buildingcontractors@yahoo.co.uk",business:"HBK Building Contractors",industry:"trades",website:"https://www.hbkbuildingcontractors.co.uk/",source:"websearch"},
  {email:"info@chamberlainbros.com",business:"Chamberlain Bros Construction",industry:"trades",website:"https://www.chamberlainbros.com/",source:"websearch"},
  {email:"info@mccarthyconstruction.co.uk",business:"McCarthy Construction",industry:"trades",website:"http://www.mccarthyconstruction.co.uk/",source:"websearch"},
  {email:"info@etmcontractors.co.uk",business:"ETM Contractors",industry:"trades",website:"https://www.etmcontractors.co.uk/",source:"websearch"},
  {email:"info@fjcrewbuilders.co.uk",business:"FJ Crew Building Contractors",industry:"trades",website:"https://fjcrewbuilders.co.uk/",source:"websearch"},
  {email:"info@bluedotltd.co.uk",business:"Blue Dot Construction",industry:"trades",website:"https://www.bluedotltd.co.uk/",source:"websearch"},
  {email:"dale@bristolbuildingcompany.co.uk",business:"Bristol Building Company",industry:"trades",website:"https://www.bristolbuildingcompany.co.uk/",contactName:"Dale",source:"websearch"},

  // CLEANING (5 new)
  {email:"info@artcleaning.co.uk",business:"Art Cleaning",industry:"cleaning",website:"https://www.artcleaning.co.uk/",source:"websearch"},
  {email:"domestics@maid2clean.co.uk",business:"Maid2Clean4U",industry:"cleaning",website:"https://www.maid2clean.co.uk/",source:"websearch"},
  {email:"southbirmingham@merrymaids.org.uk",business:"Merry Maids Birmingham",industry:"cleaning",website:"https://merrymaids.co.uk/",source:"websearch"},
  {email:"calscleaningservice@gmail.com",business:"Cals Cleaning Service",industry:"cleaning",website:"https://www.calscleaningservice.co.uk/",source:"websearch"},
  {email:"quotes@csgfm.com",business:"Cleaning Services Group",industry:"cleaning",website:"https://www.cleaningservicesgroup.co.uk/",source:"websearch"},

  // RECRUITMENT (4 new)
  {email:"info@absolutesalesjobs.com",business:"Absolute Sales & Marketing Recruitment",industry:"recruitment",website:"https://www.absolutesalesjobs.com/",source:"websearch"},
  {email:"administration@lucywalkerrecruitment.com",business:"Lucy Walker Recruitment",industry:"recruitment",website:"https://www.lucywalkerrecruitment.com/",contactName:"Lucy",source:"websearch"},
  {email:"info@jhrecruitment.co.uk",business:"Jo Holdsworth Recruitment",industry:"recruitment",website:"https://www.jhrecruitment.co.uk/",contactName:"Jo",source:"websearch"},
  {email:"marketingdept@nigelwright.com",business:"Nigel Wright Group",industry:"recruitment",website:"https://www.nigelwright.com/",source:"websearch"},

  // HEALTHCARE (11 new)
  {email:"hello@privatemedicalclinic.co.uk",business:"Private Medical Clinic",industry:"healthcare",website:"https://www.privatemedicalclinic.com",source:"websearch"},
  {email:"info@108harleystreet.co.uk",business:"108 Harley Street",industry:"healthcare",website:"https://108harleystreet.co.uk",source:"websearch"},
  {email:"info@thelondonclinic.co.uk",business:"The London Clinic",industry:"healthcare",website:"https://www.thelondonclinic.co.uk",source:"websearch"},
  {email:"enquiries@stpaulsphysio.co.uk",business:"St Pauls Physio",industry:"healthcare",website:"https://www.stpaulsphysio.co.uk",source:"websearch"},
  {email:"edgbastonphysio@gmail.com",business:"Edgbaston Physiotherapy",industry:"healthcare",website:"https://www.edgbastonphysiotherapy.co.uk",source:"websearch"},
  {email:"birmingham@paininjuryclinic.co.uk",business:"Pain and Injury Clinic",industry:"healthcare",website:"https://paininjuryclinic.co.uk",source:"websearch"},
  {email:"contact@ascenti.co.uk",business:"Ascenti Physiotherapy",industry:"healthcare",website:"https://www.ascenti.co.uk",source:"websearch"},
  {email:"optimovephysio@gmail.com",business:"Optimove Physiotherapy",industry:"healthcare",website:"https://optimovephysio.com",source:"websearch"},

  // ACCOUNTING (3 new)
  {email:"info@skaccountants.com",business:"SK Accountants",industry:"accounting",website:"https://skaccountants.com",source:"websearch"},
  {email:"info@accounts-manchester.co.uk",business:"Ali & Co Accountants",industry:"accounting",website:"https://www.accounts-manchester.co.uk",source:"websearch"},
  {email:"manchester@mha.co.uk",business:"MHA Chartered Accountants",industry:"accounting",website:"https://www.mha.co.uk",source:"websearch"},

  // INSURANCE (5 new)
  {email:"info@mccarroncoates.com",business:"McCarron Coates Insurance",industry:"insurance",website:"https://mccarroncoates.com",source:"websearch"},
  {email:"info@edinsure.co.uk",business:"Edison Ives Insurance",industry:"insurance",website:"https://edinsure.co.uk",source:"websearch"},
  {email:"enquiry@romeroinsurance.co.uk",business:"Romero Insurance Brokers",industry:"insurance",website:"https://assuredpartners.co.uk",source:"websearch"},
  {email:"info@gauntletgroup.com",business:"Gauntlet Group Insurance",industry:"insurance",website:"https://gauntletgroup.com",source:"websearch"},
  {email:"info@pib-insurance.com",business:"PIB Insurance Brokers",industry:"insurance",website:"https://www.pib-insurance.com",source:"websearch"},

  // EDINBURGH DENTAL (7 new)
  {email:"info@cherrybankedinburgh.co.uk",business:"Cherrybank Dental Edinburgh",industry:"dental",website:"https://cherrybankedinburgh.co.uk",source:"websearch"},
  {email:"info@gorgieroaddental.com",business:"Gorgie Road Dental",industry:"dental",website:"https://gorgieroaddental.com",source:"websearch"},
  {email:"info@dentistzone.co.uk",business:"Dentist Zone Edinburgh",industry:"dental",website:"https://www.dentistzone.co.uk",source:"websearch"},
  {email:"enquiries@duddingstonpark.co.uk",business:"Duddingston Park Dental",industry:"dental",website:"https://duddingstonpark.co.uk",source:"websearch"},
  {email:"info@edinburghdentist.com",business:"Edinburgh Dental Specialists",industry:"dental",website:"https://www.edinburghdentist.com",source:"websearch"},
  {email:"info@inverleithdentalcare.co.uk",business:"Inverleith Dentalcare",industry:"dental",website:"https://inverleithdentalcare.co.uk",source:"websearch"},
  {email:"SDCLreception@outlook.com",business:"Shanks Dental Care",industry:"dental",website:"https://www.shanksdentalcare.co.uk",source:"websearch"},
];

let added = 0, dupes = 0;
for (const lead of newLeads) {
  if (addLead(lead)) added++;
  else dupes++;
}
const total = loadLeads().length;
console.log("Added: " + added + " | Dupes skipped: " + dupes + " | Total leads: " + total);

// Print industry breakdown
const leads = loadLeads();
const byIndustry = {};
leads.forEach(l => { byIndustry[l.industry] = (byIndustry[l.industry] || 0) + 1; });
console.log("\nBy industry:");
Object.entries(byIndustry).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log("  " + k + ": " + v));
