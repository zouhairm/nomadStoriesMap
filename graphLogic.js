/*
This visualizes the travel stories
*/

$(function(){

  var layoutPadding = 50;
  var aniDur = 500;
  var easing = 'linear';

  var cy; 

  // get exported json from cytoscape desktop via ajax
  var graphP = $.ajax({
    url: './2018Stories_cyto.json',
    type: 'GET',
    contentType: 'application/json;charset=windows-1252',
    dataType: 'json'
  });

  // also get style via ajax
  var styleP = $.ajax({
    url: './style.cycss', // wine-and-cheese-style.cycss
    type: 'GET',
    dataType: 'text'
  });

  var infoTemplate = Handlebars.compile([
    '<p class="ac-name">{{label}}</p>',
    '<i class="fa fa-map-marker"></i> {{SetInCountry}}</p>',
    '<p class="ac-node-type"><i class="fa fa-info-circle"></i> By {{AuthorName}} ({{AuthorCountry}})</p>',
    '<p class="ac-excerpt"> <i class="fa fa-book"></i> {{storyText}} </p>',
    '{{#if ReadMore}}<div id="ReadMore" class="ac-more" > Continue Reading ... </div>{{/if}}'
  ].join(''));

  var searchResultTemplate = Handlebars.compile([
    '<p class="ac-name">{{label}}</p>',
    '<i class="fa fa-map-marker"></i> {{SetInCountry}}</p>',
    '<p class="ac-node-type"><i class="fa fa-info-circle"></i> By {{AuthorName}} ({{AuthorCountry}})</p>',
  ].join(''));



  // when both graph export json and style loaded, init cy
  Promise.all([ graphP, styleP ]).then(initCy);

  var allNodes = null; //both nodes and their compound_parents
  var allParents = null; //only compound_parents
  var allChildren = null;  //only nodes without parents
  var allEles = null; //nodes + compound_parents + edges

  var lastHighlighted = null;
  var lastUnhighlighted = null;
  var lastMouseOverHighlight = null;

  function getFadePromise( ele, opacity ){
    return ele.animation({
      style: { 'opacity': opacity },
      duration: aniDur
    }).play().promise();
  };




// **************************************************
// **************************************************
//   NODE SELECTION HIGHLIGHT LOGIC
// **************************************************
// **************************************************

  function highlight( node ){
    // var oldNhood = lastHighlighted;

    //Get neighborhood of the highlighted nodes
    var nhood = lastHighlighted    = node.outgoers().add(node); //closedNeighborhood();
    //Get all other nodes that are not part of the neighborhoods
    var others = lastUnhighlighted = allChildren.not( nhood );


    //Reset function 
    var reset = function(){
      cy.batch(function(){
        allEles.removeClass('faded hidden highlighted');

        others.addClass('faded'); //need to add faded to the edges as well! 
        nhood.addClass('highlighted');

      });

      //Wait for animation duration, and 
      //either resolve or refit depending on whether
      //state is dirty ... 

      return Promise.resolve().then(function(){
        if( isDirty() ){
          return fit();
        } else {
          return Promise.resolve();
        };
      }).then(function(){
        return Promise.delay( aniDur );
      });
    };

    var runLayout = function(){

      var l = nhood.filter(':visible').makeLayout({
        name: 'preset',
        padding: layoutPadding
      });

      var promise = cy.promiseOn('layoutstop');

      l.run();

      return promise;
    };

    var fit = function(){
      return cy.animation({
        fit: {
          eles: nhood.filter(':visible'),
          padding: layoutPadding
        },
        easing: easing,
        duration: aniDur
      }).play().promise();
    };

 
    return Promise.resolve()
      .then( reset )
      .then( runLayout )
      .then( fit )
    ;

  }

  function isDirty(){
    return lastHighlighted != null;
  }

  function clear( opts ){
    if( !isDirty() ){ return Promise.resolve(); }

    opts = $.extend({

    }, opts);

    cy.stop();
    allNodes.stop();

    var nhood = lastHighlighted;
    var others = lastUnhighlighted;

    lastHighlighted = lastUnhighlighted = null;

    var hideOthers = function(){
      return Promise.delay( 125 ).then(function(){
        others.addClass('hidden');

        return Promise.delay( 125 );
      });
    };

    var showOthers = function(){
      cy.batch(function(){
        allEles.removeClass('hidden').removeClass('faded');
      });

      return Promise.delay( aniDur );
    };

    var resetHighlight = function(){
      nhood.removeClass('highlighted');
    };

    return Promise.resolve()
      .then( resetHighlight )
      .then( hideOthers )
      .then( showOthers )
    ;
  }

  var lastShowNodeInfo = null;
  function showNodeInfo( node , storyText = null){
    lastShowNodeInfo = node;

    var nodeData = node.data()
    var storyData = {}

    if(storyText) {
      storyData['storyText'] = storyText;
    }
    else {
      storyData['storyText'] = nodeData['Excerpt'];
      storyData['ReadMore'] = true;
    }
    $('#info').html( infoTemplate( Object.assign({}, nodeData, storyData ) )).show();

    $('#ReadMore').on('click', function(){showNodeStory(lastShowNodeInfo)})
  }

  function showNodeStory( node ){
    if(node == null)
    {
      return;
    }
    var req = $.ajax({
      url: '../dataFolder/2018/'+node.data('id'),
      type: 'GET',
      dataType: 'text'
    });

    req
    .done(function(story_yaml){
      storyText = jsyaml.load(story_yaml)['Text']
      showNodeInfo(node, storyText)
    })
    .fail(function(e){console.log('error in ajax request', e)})
  }


  function hideNodeInfo(){
    $('#info').hide();
  }


// **************************************************
// **************************************************
//   CYTO INITIALIZATION and CALLBACKS SETUP
// **************************************************
// **************************************************
  function initCy( then ){
    var loading = document.getElementById('loading');
    var expJson = then[0];
    var styleJson = then[1];
    var elements = expJson.elements;



    loading.classList.add('loaded');

    cy = window.cy = cytoscape({
      container: document.getElementById('cy'),
      //Start with preset layout
      layout: { 
        name: 'preset', 
        padding: layoutPadding,
        }, 
      style: styleJson,
      elements: elements,
      motionBlur: true,
      selectionType: 'single',
      boxSelectionEnabled: false,
      autoungrabify: false
    });

    allNodes = cy.nodes();
    allParents  = allNodes.orphans();
    allChildren = allNodes.nonorphans();
    allEles = cy.elements();



    //Zoom Logic to keep background lined up
    cy.on('pan', function(evt){
      cyDiv = document.getElementById('cy') 
      var pan  = cy.pan();
      var zoom = cy.zoom() * 100 * 5;
      
      var ax = - 6.7 * zoom;
      var ay = - 3.7 * zoom;

      var x = pan.x + ax;
      var y = pan.y + ay;

      cyDiv.style.backgroundPosition = x +'px ' + y + 'px ';
      cyDiv.style.backgroundSize = zoom + '%'; 
    });


    //For each country, the locations are going to be on top of each
    //other, so we relayout using a concentric circle and use a bounding
    //box that is "reasonable"
    allParents.forEach(function(country)
    { 
      // country = allParents[0];
      var stories = country.descendants();
      var p = stories[0].position();
      var R = 5; var dR = .5;
      var theta = 0; 
      var dTheta_at_R1 = 2 * Math.PI / 5 ;
      stories.forEach(function(s)
      {
        s.position({x: p.x + R*Math.cos(theta), y: p.y + R*Math.sin(theta) });
        R += (dR);
        theta += dTheta_at_R1 / Math.sqrt(R);
      });

      var countryLayout = stories.makeLayout({
        name: 'preset',
        padding: 1,
        equidistant: true,
        minNodeSpacing: 5,
        avoidOverlap: true,
        boundingBox: { x1: p.x, y1: p.y, w: 100, h: 100},
        // returns numeric value for each node, placing higher nodes in levels towards the centre
        // we use outdegree so that those nodes more connected are on the outside!
        concentric: function( n ){ return -n.outdegree(); }
      });

      countryLayout.run();
    });

    // var newLayout = allEles.makeLayout({
    //   name: 'preset',
    //   padding: layoutPadding,
    // })
    // newLayout.run();
    cy.fit();

    cy.on('tap', function(){
      $('#search').blur();
    });

    cy.on('mouseover', 'node', _.debounce( function(e){
      var node = e.target;

      if(node.nonempty() ){

        //only highlight things if we are not dirty (i.e. nothing is selected!)
        if(!isDirty()){
          var nhood = node.outgoers().add(node);
          nhood.addClass('highlighted');
          if(lastMouseOverHighlight)
          {
            lastMouseOverHighlight.removeClass('highlighted');
          }
          lastMouseOverHighlight = nhood;


          showNodeInfo( node );
        }
        else //when dirty (i.e. something is selected, go ahead and show whole story! )
        {
          showNodeStory(node)
        }

      } else {
        hideNodeInfo();
      }

    }, 100 ) );


    cy.on('mouseout', 'node', _.debounce( function(e){
      var node = e.target;
      if(lastMouseOverHighlight != null)
      {
        if( node.nonempty() && !node.selected()){
          lastMouseOverHighlight.removeClass('highlighted');
        }
        lastMouseOverHighlight = null
      }

      // if( node.nonempty() && !node.selected()){
      //   var connectedEdges = node.connectedEdges();
      //   connectedEdges.removeClass('highlighted');
      // } 
    }, 100 ) );

    cy.on('select unselect', 'node', _.debounce( function(e){
      var node = cy.$('node:selected');

      if( node.nonempty() ){
        showNodeStory( node );
        Promise.resolve().then(function(){
          return highlight( node );
        });
      } else {
        hideNodeInfo();
        clear();
      }

    }, 100 ) );






  }
// **************************************************
// **************************************************
//                  SEARCH LOGIC
// **************************************************
// **************************************************

  var lastSearch = '';

  $('#search').typeahead({
    minLength: 3,
    highlight: true,
  },
  {
    name: 'search-dataset',
    source: function( query, cb ){
      function matches( str, q ){
        str = (str || '').toLowerCase();
        q = (q || '').toLowerCase();

        return str.match( q );
      }

      var fields = ['label', 'SetInCountry', 'AuthorCountry', 'AuthorName'];

      function anyFieldMatches( n ){
        for( var i = 0; i < fields.length; i++ ){
          var f = fields[i];

          if( matches( n.data(f), query ) ){
            return true;
          }
        }

        return false;
      }

      function getData(n){
        return n.data();
      }

      function sortByName(n1, n2){
        if( n1.data('name') < n2.data('name') ){
          return -1;
        } else if( n1.data('name') > n2.data('name') ){
          return 1;
        }

        return 0;
      }

      var res = allNodes.stdFilter( anyFieldMatches ).map( getData); //sort( sortByName ).

      cb( res );
    },
    templates: {
      suggestion: searchResultTemplate
    }
  }).on('typeahead:selected', function(e, entry, dataset){
    var n = cy.getElementById(entry.id);

    cy.batch(function(){
      allNodes.unselect();

      n.select();
    });

    showNodeInfo( n );
  }).on('keydown keypress keyup change', _.debounce(function(e){
    var thisSearch = $('#search').val();

    if( thisSearch !== lastSearch ){
      $('.tt-dropdown-menu').scrollTop(0);

      lastSearch = thisSearch;
    }
  }, 200));


// **************************************************
// **************************************************
//                  RESET BUTTON
// **************************************************
// **************************************************

  $('#reset').on('click', function(){
    if( isDirty() ){
      clear();
    } else {
      allNodes.unselect();

      hideNodeInfo();

      cy.stop();

      cy.animation({
        fit: {
          eles: cy.elements(),
          padding: layoutPadding
        },
        duration: aniDur,
        easing: easing
      }).play();
    }
  });

// **************************************************
// **************************************************
//                  FILTER LOGIC
// **************************************************
// **************************************************
  $('#filters').on('click', 'input', function(){

    var soft = $('#soft').is(':checked');
    var semiSoft = $('#semi-soft').is(':checked');
    var na = $('#na').is(':checked');
    var semiHard = $('#semi-hard').is(':checked');
    var hard = $('#hard').is(':checked');

    var red = $('#red').is(':checked');
    var white = $('#white').is(':checked');
    var cider = $('#cider').is(':checked');

    var england = $('#chs-en').is(':checked');
    var france = $('#chs-fr').is(':checked');
    var italy = $('#chs-it').is(':checked');
    var usa = $('#chs-usa').is(':checked');
    var spain = $('#chs-es').is(':checked');
    var switzerland = $('#chs-ch').is(':checked');
    var euro = $('#chs-euro').is(':checked');
    var newWorld = $('#chs-nworld').is(':checked');
    var naCountry = $('#chs-na').is(':checked');

    cy.batch(function(){

      allNodes.forEach(function( n ){
        var type = n.data('NodeType');

        n.removeClass('filtered');

        var filter = function(){
          n.addClass('filtered');
        };

        if( type === 'Cheese' || type === 'CheeseType' ){

          var cType = n.data('Type');
          var cty = n.data('Country');

          if(
            // moisture
               (cType === 'Soft' && !soft)
            || (cType === 'Semi-soft' && !semiSoft)
            || (cType === undefined && !na)
            || (cType === 'Semi-hard' && !semiHard)
            || (cType === 'Hard' && !hard)

            // country
            || (cty === 'England' && !england)
            || (cty === 'France' && !france)
            || (cty === 'Italy' && !italy)
            || (cty === 'US' && !usa)
            || (cty === 'Spain' && !spain)
            || (cty === 'Switzerland' && !switzerland)
            || ( (cty === 'Holland' || cty === 'Ireland' || cty === 'Portugal' || cty === 'Scotland' || cty === 'Wales') && !euro )
            || ( (cty === 'Canada' || cty === 'Australia') && !newWorld )
            || (cty === undefined && !naCountry)
          ){
            filter();
          }

        } else if( type === 'RedWine' ){

          if( !red ){ filter(); }

        } else if( type === 'WhiteWine' ){

          if( !white ){ filter(); }

        } else if( type === 'Cider' ){

          if( !cider ){ filter(); }

        }

      });

    });

  });

  $('#filter').qtip({
    position: {
      my: 'top center',
      at: 'bottom center',
      adjust: {
        method: 'shift'
      },
      viewport: true
    },

    show: {
      event: 'click'
    },

    hide: {
      event: 'unfocus'
    },

    style: {
      classes: 'qtip-bootstrap qtip-filters',
      tip: {
        width: 16,
        height: 8
      }
    },

    content: $('#filters')
  });


// **************************************************
// **************************************************
//                  ABOUT TOOLTIP
// **************************************************
// **************************************************

  $('#about').qtip({
    position: {
      my: 'bottom center',
      at: 'top center',
      adjust: {
        method: 'shift'
      },
      viewport: true
    },

    show: {
      event: 'click'
    },

    hide: {
      event: 'unfocus'
    },

    style: {
      classes: 'qtip-bootstrap qtip-about',
      tip: {
        width: 16,
        height: 8
      }
    },

    content: $('#about-content')
  });
});
