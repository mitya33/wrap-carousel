async function wrapCarousel(params) {
	
	//defaults
	let	spaceBetweenSlides = 15,
		containerPadding = 16,
		startSlideOutDuration = 1, //seconds
		transitionDuration = .4, //seconds
		pauseDuration = 3, //seconds
		onloadHoldDuration = 1.5, //seconds
		slidesData,
		interruptAutoInt = true,
		slideHeight = 250,
		onSlideWidth = 340,
		slideWidth,
		onSlideHeight = 300,
		slidesBumped;

	//checks
	if (!params || typeof params !== 'object') return error('@params not passed or is not an object');
	if (!params.container || !document.querySelector(params.container)) return error('could not find container element');
	if (params.imgsDirURI === undefined || typeof params.imgsDirURI != 'string') return error('no or invalid @imgsDirURI');
	if (!params.dataFileURI || typeof params.dataFileURI != 'string') return error('no or invalid @dataFileURI');
	
	//get slides data
	await new Promise((res, rej) => {
		let req = new XMLHttpRequest();
		req.open('GET', params.dataFileURI, 1);
		req.onload = response => {
			try {
				slidesData = JSON.parse(req.responseText);
				res();
			} catch(e) {
				error('Could not load slides data or file is not valid JSON');
				rej();
			}
		}
		req.send();
	});

	//checks 2
	if (slidesData.length < 3) return error('slides data must contain at least 3 slides');
	
	//inner wrapper
	let wrapper = document.createElement('div');
	wrapper.classList.add('carousel');
	wrapper.style.height = onSlideHeight+'px';
	document.querySelector(params.container).appendChild(wrapper);

	//calculate widths of non-active slides
	slideWidth = (((wrapper.offsetWidth - onSlideWidth) / (slidesData.length - 1)) - spaceBetweenSlides) - ((containerPadding * 2) / (slidesData.length - 1));

	//slide sizing CSS - set as actual CSS, to aid transitions
	document.head.innerHTML += `
	<style>
	.carousel { padding: ${containerPadding}px; }
	.carousel li { width: ${slideWidth}px; height: ${slideHeight}px; }
	.carousel li.on { width: ${onSlideWidth}px; height: ${onSlideHeight}px; }
	</style>`;
		
	//carousel
	let carousel_node = document.createElement('ul');
	wrapper.appendChild(carousel_node);
	
	//slides - build each slide
	for (let u=0; u<slidesData.length; u++) {
		
		let thisSlideIsOn = u + 1 == Math.ceil(slidesData.length / 2);
			li = document.createElement('li');
		li.style.background = "url('"+(params.imgsDirURI ? params.imgsDirURI+'/' : '')+slidesData[u].bgImgURL+"')";
		li.id = 'carouselSlide_'+u;
		carousel_node.appendChild(li);
		if (thisSlideIsOn) li.classList.add('on');
		
		let captionHolder = document.createElement('div');
		captionHolder.classList.add('caption-holder');
		li.appendChild(captionHolder);
		
		if (slidesData[u].headline) {
			let heading = document.createElement('h3');
			heading.textContent = slidesData[u].headline;
			captionHolder.appendChild(heading);
		}
			
		let text = document.createElement('p');
		text.innerHTML = slidesData[u].caption;
		captionHolder.appendChild(text);

	}
	
	slides = carousel_node.querySelectorAll('li');

	//position slides - @indexOfSlideToTurnOn is set only for future iterations; onload, it's the middle slide by default
	function positionSlides(indexOfSlideToTurnOn, isOnLoad) {
		
		//prep
		let left,
			on = Array.from(slides).filter(el => el.matches('.on'))[0],
			indexOfOn = parseInt(slideIndex(on)),
			wasOn,
			wasOnIndex,
			bumped,
			carouselMidPoint = (carousel_node.offsetWidth / 2) - (onSlideWidth / 2);
		
		//if any time other than load, turn off currently-on slide and turn on slide represented by @indexOfSlideToTurnOn...
		if (indexOfSlideToTurnOn || indexOfSlideToTurnOn === 0) {
			wasOn = on;
			wasOnIndex = indexOfOn;
			wasOn.classList.remove('on');
			on = slides[indexOfSlideToTurnOn];
			on.classList.add('on');
			
			//...log indexes of bumped slides
			bumped = indexOfSlideToTurnOn - Math.floor(slidesData.length/2); //slides bumped beyond boundary
			slidesBumped = [];
			if (bumped > 0)
				for(let b=0; b<bumped; b++) slidesBumped.push(b);
			else
				for(let b=0; b<Math.abs(bumped); b++) slidesBumped.push(slidesData.length-1-b);
		}
		
		//prep cont.
		indexOfOn = slideIndex(on);
		
		//iterate over slides, work out new left pos and do anim on each. For new 'on' slide, enlarge (for prev on slide, contract)
		slides.forEach(function(el, i) {
			
			let thisSlideIndex = i,
				thisSlideIsOn = indexOfOn === thisSlideIndex;
			
			if (!indexOfSlideToTurnOn && indexOfSlideToTurnOn !== 0) {
				left = thisSlideIndex * (slideWidth + spaceBetweenSlides);
				if (indexOfOn < thisSlideIndex) left += onSlideWidth - slideWidth;
			} else {
				if (thisSlideIndex == indexOfSlideToTurnOn) {
					left = carouselMidPoint;
				} else {
					if (thisSlideIndex > indexOfSlideToTurnOn) {
						left = (Math.floor(slidesData.length / 2) * (slideWidth + spaceBetweenSlides)) + onSlideWidth + spaceBetweenSlides;
						left += ((thisSlideIndex - indexOfSlideToTurnOn)-1) * (slideWidth + spaceBetweenSlides);
					} else
						left = carouselMidPoint - ((indexOfSlideToTurnOn - thisSlideIndex) * (slideWidth + spaceBetweenSlides));
				}
			}
			
			let animCallback,
				duration = indexOfSlideToTurnOn || indexOfSlideToTurnOn === 0 ?
					transitionDuration * 1000 :
					startSlideOutDuration * 1000;
						
			//do anim on slides
			el.style.left = left+'px';
			
		});
		
		//for slides bumped beyond the carousel's left or right boundary, as it slides out into invisibility, clone it and, simultaneously,
		//slide in the clone at the end, giving wrap effect. After anim, remove clone and replace with actual slide that was bumped by
		//removing it from the DOM and reinserting it (this maintains the node order - crucial to anim)
		//cloneData = multi-dim array for each clone: [0] = clone node, [1] = target left, [2] = reference to slide that was cloned, [3] = reinsertion
		//func. Storing all this means that, after each() has run, we can animate all clones to their places and remove the slides they are clones of.
		if (bumped != undefined) {
			let cloneData = [],
				counter = 0;
			slides.forEach(function(el, i) {
				let thisSlideIndex = i;
				if (slidesBumped.includes(thisSlideIndex)) {
					
					let arrayPos = slidesBumped.indexOf(thisSlideIndex);
						arrayPos_inverted = (slidesBumped.length - 1) - arrayPos;
					
					//bumped off left or right edge?
					let boundary = thisSlideIndex < indexOfSlideToTurnOn ? 'left' : 'right';
					
					//clone bumped slide, insert it into DOM and position it in preparation for its appearance. DOM insertion place depends on
					//which other slides bumped - must maintain DOM order for future shuffling to work!
					let clone = el.cloneNode(1);
					
					let insertionFunc;
					if (boundary == 'right')
						 insertionFunc = () => {
						 	arrayPos === 0 && slidesBumped.length > 1 ? carousel_node.children[arrayPos].after(clone) : carousel_node.prepend(clone);
						 }
					else
						insertionFunc = () => carousel_node.append(clone);
						
					clone.style.left = (boundary == 'right' ? -slideWidth : carousel_node.offsetWidth)+'px';
					
					//work out target left for clone
					let targetLeft;
					if (boundary == 'right')
						targetLeft = counter * (slideWidth + spaceBetweenSlides);
					else
						targetLeft = carousel_node.offsetWidth - (slideWidth * (arrayPos_inverted + 1)) - (arrayPos_inverted * spaceBetweenSlides);

					//log this clone's data
					cloneData.push([clone, targetLeft, el, insertionFunc]);
					counter++;
					
				}
			});
			
			//visually bring in clones now each() has done
			cloneData.forEach(val => {
				val[3]();
				setTimeout(() => {
					val[0].style.left = val[1]+'px';
					val[2].remove();
					slides = carousel_node.querySelectorAll('li');
				}, transitionDuration * 1000);
			});
			
		}
		
	}

	//kick things off
	setTimeout(function() {
		autoInt = setInterval(function() {
			if (interruptAutoInt) return;
			slides[Math.ceil(slidesData.length/2)].click();
		}, pauseDuration * 1000);
	}, onloadHoldDuration * 1000);
		
	//centre starting .on slide
	positionSlides(null, 1);
	
	//click - when a not-on slide is clicked, turn it on. If clicked again while on, go to slide's associated URL
	carousel_node.addEventListener('click', evt => {
		let li = evt.target.closest('li');
		if (!li) return;
		if (li.matches(':not(.on)'))
			positionSlides(slideIndex(li));
		else
			location.href = slidesData[li.id.match(/\d+$/)].linkURL;
	});
	
	//pause/unpause on container hover
	//wrapper.addEventListener('mouseenter', () => interruptAutoInt = 1);
	//wrapper.addEventListener('mouseleave', () => interruptAutoInt = 0);

	//error
	function error(txt) { console.error('WRAP CAROUSEL', txt); }

	//slide index (in current stack)
	function slideIndex(li) {
		let ret = 0, el = li;
		while(el.previousSibling) {
			ret++;
			el = el.previousSibling;
		}
		return ret;
	}
	
}