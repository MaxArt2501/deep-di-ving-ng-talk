import { PresentationDeckElement, registerElements } from 'p-slides';

/** @type {PresentationDeckElement} */
const deck = document.querySelector('p-deck');

function handleHash() {
	const hash = location.hash.slice(1);
	const params = new URLSearchParams(hash);
	const [slideRef] = [...params.keys()];

	const slide = getSlide(slideRef);
	const current = document.querySelector('p-slide[aria-current="page"]');
	if (slide && slide !== current) {
		slide.setAttribute('aria-current', 'page');
		current?.setAttribute('aria-current', 'false');
	}

	const mode = params.get('mode');
	if (mode) {
		deck.setAttribute('mode', mode);
	} else {
		deck.removeAttribute('mode');
	}
}
addEventListener('hashchange', handleHash);
handleHash();

function getSlide(slideRef) {
	if (/^\d+$/.test(`${slideRef}`.trim())) {
		return deck.querySelectorAll('p-slide')[+slideRef] || null;
	}
	return document.querySelector(`#${slideRef}`);
}

const progressBar = document.querySelector('body > progress');
const uiButtonList = document.querySelectorAll('body > :is(nav, [role="toolbar"]) button');

uiButtonList.forEach(button => {
	const [tooltip] = button.ariaLabelledByElements;
	let hoverTimeout;
	button.addEventListener('focus', () => tooltip.showPopover());
	button.addEventListener('blur', () => tooltip.hidePopover());
	button.addEventListener('pointerenter', () => {
		if (!button.matches(':focus')) {
			hoverTimeout = setTimeout(() => tooltip.showPopover(), 500);
		}
	});
	button.addEventListener('pointerleave', () => {
		if (hoverTimeout) {
			tooltip.hidePopover();
			hoverTimeout = clearTimeout(hoverTimeout);
		}
	});
	tooltip.addEventListener('toggle', ({ newState }) => {
		if (newState === 'closed') {
			hoverTimeout = clearTimeout(hoverTimeout);
		}
	});
});

const uiButtons = Object.groupBy(uiButtonList, button => button.getAttribute('aria-labelledby').slice(0, -7));

function toggleNavButtons() {
	uiButtons.goBackward[0].disabled = deck.atStart;
	uiButtons.goForward[0].disabled = deck.atEnd;
}

function changeHash(slide) {
	const slideRef = slide.id || deck.currentIndex;
	const { mode } = deck;
	location.hash = '#' + slideRef + (mode === 'presentation' ? '' : `&mode=${mode}`);
}
const lazyAttribs = ['src', 'srcset', 'href'];
const lazySelector = lazyAttribs.map(attrib => `[data-lazy-${attrib}]`).join();
function loadLazyMedia(root) {
	for (const element of root.querySelectorAll(lazySelector)) {
		for (const { name, value } of Object.values(element.attributes)) {
			if (name.startsWith('data-lazy-')) {
				const realAttribute = name.slice(10);
				const realAttributeValue = element.getAttribute(realAttribute);
				if (realAttributeValue !== value) {
					element.setAttribute(realAttribute, value);
				}
			}
		}
	}
}

let stepsToSlide, stepTotalCount;

function updateProgressBar() {
	if (typeof stepTotalCount !== 'number') {
		stepsToSlide = Array.from(deck.slides, slide => slide.fragmentSequence.length + 1).reduce(
			(list, count) => [...list, (list.at(-1) ?? 0) + count],
			[]
		);
		stepTotalCount = stepsToSlide.at(-1);
	}

	const { currentIndex, currentSlide } = deck;
	const { fragmentSequence, nextHiddenFragments } = currentSlide;
	const nextSequenceIndex = nextHiddenFragments
		? fragmentSequence.findIndex(sequence =>
				sequence.every((fragment, index) => sequence.length === nextHiddenFragments.length && nextHiddenFragments[index] === fragment)
		  )
		: -1;
	const currentStep =
		nextSequenceIndex >= 0
			? (stepsToSlide[currentIndex - 1] ?? 0) + (nextSequenceIndex >= 0 ? nextSequenceIndex : 0) + 1
			: stepsToSlide[currentIndex];
	const progress = ((currentStep - 1) * 100) / (stepTotalCount - 1);
	progressBar.value = isFinite(progress) ? progress : 100;
}

deck.addEventListener('p-slides.slidechange', ({ detail: { slide } }) => {
	loadLazyMedia(slide);
	changeHash(slide);
	updateProgressBar();

	toggleNavButtons();
	setTimeout(() => {
		deck.style.setProperty('--current-slide-bg', getComputedStyle(slide).getPropertyValue('--slide-bg'));
	});
});

deck.addEventListener('p-slides.fragmenttoggle', () => {
	toggleNavButtons();
	updateProgressBar();
});

uiButtons.goBackward[0].addEventListener('click', () => deck.previous());
uiButtons.goForward[0].addEventListener('click', () => deck.next());

['presentation', 'speaker', 'grid'].forEach(mode => uiButtons[`${mode}Mode`][0].addEventListener('click', () => {
	deck.mode = mode;
	changeHash(deck.currentSlide);
}));

uiButtons.fullscreenMode[0].addEventListener('click', () => {
	if (document.fullscreenElement) {
		document.exitFullscreen();
	} else {
		document.body.requestFullscreen();
	}
});

PresentationDeckElement.styles = new URL('../css/deck.css', import.meta.url).toString();
registerElements();
