// Demo restaurants shared by the table menus and the pickup app.
// Image paths starting with "/" are served from public/.

const unsplash = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const peppermintMenu = [
  {id:'m1',category:'Popular',name:'Truffle Chicken Pasta',desc:'Creamy parmesan sauce, mushrooms, grilled chicken.',price:2350,emoji:'🍝',image:'/images/menu/m1.jpg'},
  {id:'m2',category:'Popular',name:'Pepper Beef Rice',desc:'Wok-seared beef, black pepper glaze and steamed rice.',price:1980,emoji:'🍛',image:'/images/menu/m2.jpg'},
  {id:'m3',category:'Mains',name:'Crispy Chicken Burger',desc:'Buttermilk chicken, slaw, pickles and house sauce.',price:1750,emoji:'🍔',image:'/images/menu/m3.jpg'},
  {id:'m4',category:'Mains',name:'Pesto Penne',desc:'Basil pesto, cherry tomato and parmesan.',price:1650,emoji:'🥗',image:'/images/menu/m4.jpg'},
  {id:'m5',category:'Drinks',name:'Passion Fruit Mojito',desc:'Passion fruit, lime, mint and soda.',price:790,emoji:'🍹',image:'/images/menu/m5.jpg'},
  {id:'m6',category:'Drinks',name:'Iced Spanish Latte',desc:'Double espresso, milk and condensed milk.',price:890,emoji:'🥤',image:'/images/menu/m6.jpg'},
  {id:'m7',category:'Dessert',name:'Chocolate Lava Cake',desc:'Warm chocolate centre with vanilla ice cream.',price:1100,emoji:'🍰',image:'/images/menu/m7.jpg'}
];

export const amraMenu = [
  {id:'a1',category:'Popular',name:'Buffalo Chicken',desc:'Crispy chicken tossed in buffalo sauce.',price:1336.5,image:'https://static.spotapps.co/spots/19/7d4051f2d74b8d933fe56a536af0e9/full'},
  {id:'a2',category:'Kottu',name:'Chicken Cheese Kottu',desc:'Chicken, cheese and chopped roti wok-tossed together.',price:1890,image:'https://152403959.cdn6.editmysite.com/uploads/1/5/2/4/152403959/IKJ3EPDAGWB44WYB3OJEIQUW.png?optimize=medium&width=2400'},
  {id:'a3',category:'Kottu',name:'Mix Kottu',desc:'A generous mix of meat, chicken and vegetables with chopped roti.',price:2295,image:'https://hashanwijemanna.github.io/Sigiri-Restaurant/images/food/mixkottu.jpg'},
  {id:'a4',category:'Rice',name:'Seafood Fried Rice',desc:'Wok-fried rice with seafood and vegetables.',price:2160,image:'https://images.deliveryhero.io/image/menu-import-gateway-prd/regions/AS/chains/tabsquare_sg/43ec7bcbfb3d08405dfb801332e846f4.png?width=%25s'},
  {id:'a5',category:'Mains',name:'Butter Chicken',desc:'Tender chicken in a rich, creamy tomato sauce.',price:2686.5,image:'https://static.wixstatic.com/media/562d79_80fd3dd2011145a7b3457320f472ac94~mv2.jpg/v1/fill/w_480,h_480,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/562d79_80fd3dd2011145a7b3457320f472ac94~mv2.jpg'},
  {id:'a6',category:'Seafood',name:'Shrimp in Heaven',desc:'Juicy shrimp in a rich house preparation.',price:3847.5,image:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Prawns_Plancha.jpg'},
  {id:'a7',category:'Dessert',name:'Watalappam',desc:'Traditional Sri Lankan coconut custard pudding.',price:405,image:'https://www.milkmaid.lk/sites/default/files/2024-03/Watalappan-image-WS-%287%29.jpg'}
];

// Mirrors the client-side menu in public/glounge.js.
export const gloungeMenu = [
  {id:'g1',category:'Popular',name:'Chicken Pasta',desc:'Creamy chicken pasta.',price:1550,image:unsplash('photo-1702827761984-205e57a3a633')},
  {id:'g2',category:'Popular',name:'Chocolate Blast',desc:'Rich chocolate waffle creation.',price:1215,image:unsplash('photo-1726039468346-2f3e0f1f5b52')},
  {id:'g3',category:'Popular',name:'Chicken Enchilada',desc:'Two tortillas filled with chicken and special sauce, topped with cheese.',price:1850,image:unsplash('photo-1565299585323-38d6b0865b47')},
  {id:'g4',category:'Popular',name:'Pistachio Shake',desc:'Rich pistachio milkshake.',price:1360,image:unsplash('photo-1530373239216-42518e6b4063')},
  {id:'g5',category:'Popular',name:'Chicken Slider',desc:'Two crispy chicken sliders with house sauce, cheese and jalapeno.',price:1070,image:unsplash('photo-1528735602780-2552fd46c7af')},
  {id:'g6',category:'Bubble Tea',name:'Strawberry Bubble Tea',desc:'Strawberry bubble tea.',price:790,image:unsplash('photo-1579954115545-a95591f28bfc')},
  {id:'g7',category:'Bubble Tea',name:'Passion Bubble Tea',desc:'Passion fruit bubble tea.',price:790,image:unsplash('photo-1546173159-315724a31696')},
  {id:'g8',category:'Bubble Tea',name:'Mango Bubble Tea',desc:'Mango bubble tea.',price:790,image:unsplash('photo-1621427016981-25b2381f5538')},
  {id:'g9',category:'Coffee',name:'Cappuccino',desc:'Espresso with steamed milk and foam.',price:690,image:unsplash('photo-1497636577773-f1231844b336')},
  {id:'g10',category:'Coffee',name:'Iced Spanish Latte',desc:'Espresso, milk and condensed milk served over ice.',price:890,image:unsplash('photo-1509042239860-f550ce710b93')},
  {id:'g11',category:'Waffles',name:'Nutella Waffle',desc:'Warm waffle with Nutella and toppings.',price:1090,image:unsplash('photo-1634215751955-5bdb12db6c0c')},
  {id:'g12',category:'Waffles',name:'Chocolate Waffle',desc:'Warm waffle with rich chocolate sauce.',price:1090,image:unsplash('photo-1633997455043-434ee7ca3e1a')},
  {id:'g13',category:'Mains',name:'Chicken Burger',desc:'Crispy chicken burger with cheese and house sauce.',price:1750,image:unsplash('photo-1481070555726-e2fe8357725c')},
  {id:'g14',category:'Mains',name:'Chicken Wings',desc:'Crispy chicken wings with house seasoning.',price:1650,image:unsplash('photo-1586809104697-1d438a00455f')},
  {id:'g15',category:'Desserts',name:'Brownie with Ice Cream',desc:'Warm chocolate brownie served with vanilla ice cream.',price:990,image:unsplash('photo-1702827402870-7c33dc7b67be')},
  {id:'g16',category:'Desserts',name:'Chocolate Cake',desc:'Rich chocolate cake.',price:950,image:unsplash('photo-1540337706094-da10342c93d8')}
];

// Fictional demo restaurant.
export const kadeMenu = [
  {id:'k1',category:'Hoppers',name:'Egg Hopper',desc:'Crisp-edged rice flour hopper with a soft egg in the middle.',price:320,image:'/images/pickup/k1.jpg'},
  {id:'k2',category:'Hoppers',name:'Hopper Set',desc:'Two egg hoppers, two plain hoppers, lunu miris and seeni sambol.',price:1150,image:'/images/pickup/k2.jpg'},
  {id:'k3',category:'Hoppers',name:'String Hoppers & Egg Curry',desc:'Fifteen string hoppers with egg curry and pol sambol.',price:890,image:'/images/pickup/k3.jpg'},
  {id:'k4',category:'Kottu',name:'Chicken Kottu',desc:'Chopped godamba roti, chicken, egg and leeks off the hot plate.',price:1450,image:'/images/pickup/k4.jpg'},
  {id:'k5',category:'Kottu',name:'Seafood Kottu',desc:'Prawns, cuttlefish and fish chopped with roti and curry gravy.',price:1950,image:'/images/pickup/k5.jpg'},
  {id:'k6',category:'Plates',name:'Kade Sharing Plate',desc:'Dhal, chickpea curry, pol sambol and godamba roti to share.',price:1650,image:'/images/pickup/k6.jpg'},
  {id:'k7',category:'Drinks',name:'Faluda',desc:'Rose syrup, milk, basil seeds and jelly, topped with ice cream.',price:650,image:'/images/pickup/k7.jpg'}
];

// Fictional demo restaurant.
export const sunriseMenu = [
  {id:'s1',category:'Pastries',name:'Butter Croissant',desc:'Laminated by hand, baked every morning.',price:590,image:'/images/pickup/s1.jpg'},
  {id:'s2',category:'Pastries',name:'Cinnamon Roll',desc:'Soft brioche swirl with cinnamon sugar and cream cheese icing.',price:650,image:'/images/pickup/s2.jpg'},
  {id:'s3',category:'Bread',name:'Sourdough Loaf',desc:'Slow-fermented country loaf. Sliced on request.',price:1400,image:'/images/pickup/s3.jpg'},
  {id:'s4',category:'Cakes',name:'Banana Bread',desc:'Two thick slices, made with ripe ambul bananas.',price:520,image:'/images/pickup/s4.jpg'},
  {id:'s5',category:'Cakes',name:'Chocolate Chip Cookies',desc:'Box of four, crisp edges and a chewy centre.',price:780,image:'/images/pickup/s5.jpg'},
  {id:'s6',category:'Coffee',name:'Cappuccino',desc:'Double shot with steamed milk and foam.',price:720,image:unsplash('photo-1497636577773-f1231844b336')},
  {id:'s7',category:'Coffee',name:'Iced Latte',desc:'Double shot over ice with fresh milk.',price:820,image:unsplash('photo-1509042239860-f550ce710b93')}
];

export const restaurants = [
  {id:'peppermint',name:'Peppermint Café',area:'Colombo 03',cuisine:'Café · Pasta · Burgers',prepMinutes:15,accent:'#244633',cover:'/images/menu/m1.jpg',menu:peppermintMenu},
  {id:'amra',name:'Amra Leaf',area:'Negombo · Chilaw Road',cuisine:'Sri Lankan · Kottu · Seafood',prepMinutes:20,accent:'#2f5d3a',cover:amraMenu[1].image,menu:amraMenu},
  {id:'glounge',name:'G Lounge',area:'Negombo',cuisine:'Waffles · Bubble tea · Coffee',prepMinutes:10,accent:'#3b2a4d',cover:gloungeMenu[10].image,menu:gloungeMenu},
  {id:'kade',name:'Kade Hoppers',area:'Wellawatte',cuisine:'Hoppers · Kottu · Street food',prepMinutes:15,accent:'#9a3b12',cover:'/images/pickup/k1.jpg',menu:kadeMenu},
  {id:'sunrise',name:'Sunrise Bakehouse',area:'Nugegoda',cuisine:'Bakery · Coffee',prepMinutes:10,accent:'#8a5a14',cover:'/images/pickup/s2.jpg',menu:sunriseMenu}
];
