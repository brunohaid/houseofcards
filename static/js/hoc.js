var HOC = {
	// Configuration
	config: {
		// Fraction of card height when card snaps to bottom, eg 1/10 means the value is 10
		normalsnap: 10,
		mobilesnap: 8,
	},

	// Global variables
	touch: ('ontouchstart' in document.documentElement),
	ios: /(iPad|iPhone|iPod)/g.test(navigator.userAgent),

	// Browser specific properties
	vendors: ['webkit','moz','o','ms'],
	browser: undefined,
	opacity: '',

	// Let's get this party started
	init: function() {
		var el = document.createElement('div').style, v = this.vendors, i, l;

		// Determine CSS opacity property
		if (el.opacity !== undefined) this.opacity = 'opacity';
		else {
			for (i = 0, l = v.length; i < l; i++) {
				if (el[v[i] + 'Opacity'] !== undefined) {
					this.opacity = v[i] + 'Opacity';
					this.browser = v[i];
					break;
				}
			}
		}

		// Find out which browser we're using if we dont't know yet
		if (!this.browser) {
			for (i = 0, l = v.length; i < l; i++) {
				if (el[v[i] + 'Transition'] !== undefined) {
					this.browser = v[i];
					break;
				}
			}
		}

		// Set vendor specific global animationframe property
		// Paul Irish polyfill from http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
		(function() {
		    var lastTime = 0, vendors = HOC.vendors;
		    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
		        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
		        window.cancelAnimationFrame =
		          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
		    }

		    if (!window.requestAnimationFrame)
		        window.requestAnimationFrame = function(callback, element) {
		            var currTime = HOC.util.now();
		            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
		            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
		              timeToCall);
		            lastTime = currTime + timeToCall;
		            return id;
		        };

		    if (!window.cancelAnimationFrame)
		        window.cancelAnimationFrame = function(id) {
		            clearTimeout(id);
		        };
		}());

		// Count cards, set their z-index and create lookup array
		this.deck.init();

		// Add scrolling event handler
		this.util.register(document,'scroll',this.ui.scrollhandler);

		// Add Resize event handler
		this.util.register(window,'resize',this.ui.resize.handler);	

		// Add global focus & blur event handlers.
		// This is especially important on touch devices, as they will attempt to scroll back to the top, 
		// so that the fixed stack is in focus.
		// These two need capture set to true, see https://developer.mozilla.org/en-US/docs/Web/Events/blur#Event_delegation
		this.util.register(document,'blur',this.ui.focushandler,true);	
		this.util.register(document,'focus',this.ui.focushandler,true);		
	},

	// Visual parts
	ui: {
		// This values might change over time, thus we wrap it in functions
		mini: function() { return (window.innerWidth < 481) },
		midi: function() { return (window.innerWidth > 480 && window.innerWidth < 901) },

		// Height of whatever space we use for the deck, most likely window, initially set to window.innerHeight
		height: window.innerHeight,

		// Flags
		focus: true,

		// Various easings
		// Code: https://github.com/danro/jquery-easing/blob/master/jquery.easing.js
		// Overview / demos: http://easings.net/		
		easings: {
			quad: function(t,b,c,d) {
				if ((t/=d/2) < 1) return c/2*t*t + b;
				return -c/2 * ((--t)*(t-2) - 1) + b;				
			}
		},

		// Takes a DOM node and an object of its target state and a duration in msec
		// Eg (document.body, { marginLeft: 100, marginTop: 100 }, 400)
		tween: function(node,targetstate,duration,callback) {
			var transition = {}, start = HOC.util.now(), that = HOC.ui;

			// Build transition object
			for (prop in targetstate) {
				// Ignore prototype
				if (!targetstate.hasOwnProperty(prop)) continue;

				// Create full transition object
				transition[prop] = {
					target: targetstate[prop],
					start: parseInt(node.style[prop].replace(/[^\d.-]/g, '')) || 0
				};

				// Calculate distanze we have to bridge
				transition[prop].distance = transition[prop].target - transition[prop].start;
			}

			// Step through frames
			function step() {
				var dt = HOC.util.now() - start, done, value;

				// Damn, we took too long
				if (dt >= duration) done = true;

				// Build transition object
				for (prop in transition) {

					// Ignore prototype
					if (!transition.hasOwnProperty(prop)) continue;

					// Apply style, either the start value with whats being returned from the easing function, or the fnal value if we should be done
					node.style[prop] = (done) ? transition[prop].target : transition[prop].start + Math.round(that.easings.quad(dt, 0, transition[prop].distance, duration));
				}						

				// Always keep stepping if we aren't done
				if (!done) that.render(step);

				// Otherwise fire callback if we have one
				else if (callback) callback();
			}			

			// Kick off stepper
			this.render(step);
		},

		// Generic requestAnimationFrame wrapper
		render: function(fn) {
			// Check if a function is passed, try eval otherwise
			if (typeof fn != 'function') fn = fn();

			// If window has focus
			// TODO: Make sure we don't create a huge backlog when window is not focused
			if (this.focus) {
				requestAnimationFrame(fn)
			} else {
				fn();
			}			
		},

		// Handle scrollevent on document body
		scrollhandler: function(event) {
			var card, top;

			// Give mini designs a bit of snappyness by attaching the card to the deck earlier
			top = document.body.scrollTop - ( HOC.ui.height / (HOC.ui.mini() ? HOC.config.mobilesnap : HOC.config.normalsnap));

			// Convert current scrollposition to what would be the respective card
			card = Math.floor(top / HOC.ui.height);

			// Abort if we're still on the same card
			if (card == HOC.deck.currentcard) return;

			// Blur input fields once we leave the card with the input field
			// Only on non-touch devices, as on touch devices we have to make sure we keep the card with the inpur field in view despite scrollintoview
			if (!HOC.touch && (document.activeElement.nodeName.toLowerCase() == 'input' || document.activeElement.nodeName.toLowerCase() == 'textarea')) document.activeElement.blur();

			// Tell deck to move to respective card
			HOC.deck.moveto(card)
		},

		// If we have any kind of focus or blur event
		// This also fires if the tab/window is blurred or focussed, but we don't have a use case atm
		focushandler: function(event) {
			var target = event.target || event.srcElement;

			// Only consider events on input or textarea fields
			// http://aleembawany.com/2009/02/11/tagname-vs-nodename/
			if (target.nodeName.toLowerCase() != 'input' && target.nodeName.toLowerCase() != 'textarea') return;

			// Hide the cards that are not on the stack
			HOC.deck.hidespread(event.type == 'blur')
		},

		// All resize related stuff
		resize: {
			// Timer: This makes sure we don't resize too often, ideally after user finished resizing
			// Store timer ID
			timer: 0,
			// Execute resize actions if there was no further resze within n msecs, n is defined by delay
			delay: 200,

			// Called when either the user or the browser (eg iOS safari addressbar) resizes the window
			handler: function(event) {
				var that = HOC.ui.resize, newheight, relativeposition;

				// Remove active timeout if we should have one
				if (that.timer) window.clearTimeout(that.timer);				

				// Set new anon function to execute after timer expired
				that.timer = window.setTimeout(function(){					
					// Wrap in rAf to keep it sync with resize (and resize can rely on new ui.height value)
					HOC.ui.render(function(){
						// Copy so we only have to look this up once
						newheight = window.innerHeight;

						// Scroll to new position to keep stuff aligned, slightly offset for changed viewport height
						document.body.scrollTop = newheight * (document.body.scrollTop / HOC.ui.height) + (newheight - HOC.ui.height)

						// Get & set our new height value
						HOC.ui.height = newheight;				
					})

					// Resize deck at once
					HOC.deck.resize();	

					// Reset timeout
					that.timeout = 0;					
				},that.delay);		
			},
		}
	},

	// Logic and internal values for the deck
	deck: {
		// List of DOM Nodes that represent our cards, so we don't have to access the DOM all the time / use getElementsByClassName
		cards: [],

		// Internal values, currentcard is 0indexed as are all other card values
		currentcard: 0,
		inited: false,

		// Timestamps & related values
		lastmove: 0,
		defaultvelocity: 300,

		// Scrolling stuff
		lastscrollpos: 0,

		// DOM element ID
		root: document.getElementById('deck'),

		// Count the number of cards in the HTML stack
		init: function() {

			// Start marker with firstchild and counter at 0
			var node = this.root.firstChild, counter = 0, zindex = 10000;

			// Abort if deck is empty or already inited
			if (!node || this.inited) return;

			// Iterate through siblings 
			while (node) {	

				// Make sure we count only cards and not some erroneous HTML or whitespace textNodes
				if (node.nodeType == 1 && node.className.indexOf('card') > -1) {

					// Add it to our internal array
					this.cards.push(node);
		
					// Set it's z-index (and iterate it)
					node.style.zIndex = zindex--;

					// Make all cards stacked per default (except the first one)
					if (this.cards.length > 1) node.className += ' stacked';
				}	

				// Go to next node
				node = node.nextSibling;			
			}

			// Set initial size
			this.resize();

			// Set flag
			this.inited = true;
		},

		// Recalculate all styles on initial load or when the viewport/browser changes
		resize: function() {
			var that = this, i, l, offset, card;

			// Wrap in rAf to keep it sync with resize
			HOC.ui.render(function(){

				// Get style
				offset = (HOC.ui.mini()) ? 0 : 40;

				// Adjust the deck height to number of cards
				that.root.style.height = ((that.cards.length * HOC.ui.height) - offset) + 'px';		

				// Resize & reposition each card height
				for (i = 0, l = that.cards.length; i < l; i++ ) {
					// Also adjust top value if card is not on the fixed stack
					if (i > 0 && that.cards[i].className.indexOf('stacked') == -1) that.cards[i].style.top = (i * HOC.ui.height) + 'px';

					// Set height to screen
					that.cards[i].style.height = (HOC.ui.height - offset) + 'px';
				}
			});	
		},		

		// Go to a specific card
		moveto: function(targetcard) {
			var direction, i, card, mini = HOC.ui.mini();

			// Double check that we really have to move something, and that we are not above the first card 
			// or out of bounds (but keep rubber banding)
			if (targetcard < 0 || targetcard >= this.cards.length || targetcard == this.currentcard) return;

			// Get direction
			direction = (targetcard - this.currentcard > 0) ? 1 : -1;

			// Go through all cards in between the current and desired one
			while (this.currentcard != targetcard) {
				// Get card we have to adapt from internal array, if scrolling up it's the card ahead of the currentcard
				card = this.cards[this.currentcard + ((direction == 1) ? 1 : 0) ];

				// Change CSS
				if (direction == 1) {
					// Remove stacked CSS
					card.className = card.className.replace(' stacked','');
					// Set proper top distance
					card.style.top = HOC.ui.height * (this.currentcard + 1) + 'px';
				} else {
					// Remove 
					card.className += ' stacked';	
					// Set top
					card.style.top = (mini) ? '0' : '20px';									
				}

				// Set current card	
				this.currentcard = this.currentcard + direction;				
			}

			// Reset lastmove timestamp
			this.lastmove = HOC.util.now(); 
		},

		// Hide (or show again) parts of the deck
		// We first needed this on touch browsers, that scrollintoview to top to "reveal" input fields, because the browser thinks that
		// if they are on the fixed stack, this means that scrolltop needs to be 0. Instead of prevent it, we just hide the spread out cards.
		hidespread: function(showagain) {
			// Remember our lastscrollposition
			if (!showagain) this.lastscrollposition = document.body.scrollTop;

			// Return to our last scrollposition when we blur
			if (showagain) document.body.scrollTop = this.lastscrollposition;			

			// Go through our cards
			for ( i = 0, l = this.cards.length; i < l; i++ ) {
				// Change the property of all cards that are not stacked
				if (this.cards[i].className.indexOf('stacked') == -1) this.cards[i].style.display = (showagain) ? 'block' : 'none';
			}
		}		
	},

	// Various utilities
	util: {
		// Return UTC Unix timestamp
		now: function() {
			return Date.now();
		},

		// Cross browser event registration
		register: function(obj, eventType, handler, capture) {
			// Set default value for capture
			capture = capture || false;

			// Go through various implementations
			// Ideally we have addEventlistener support
			if (obj.addEventListener) obj.addEventListener(eventType.toLowerCase(), handler, capture);
			// Try attachevent
			else if (obj.attachEvent) obj.attachEvent('on'+eventType.toLowerCase(), handler);
			// Fall back to onEvent 
			else {
				var et=eventType.toUpperCase();
				if ((obj.Event) && (obj.Event[et]) && (obj.captureEvents)) obj.captureEvents(Event[et]);
				obj['on'+eventType.toLowerCase()]=handler;
			}
		}
	}
};

// Izit?
HOC.init();