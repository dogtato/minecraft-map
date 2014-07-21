/*global $ */
var mainApp,
    // used for a popup for adding/editing wiki data
    editWindow = null;

function Boundary(centerX, centerY, width, height) {
    'use strict';
    this.centerX = centerX;
    this.centerY = centerY;
    this.width = width;
    this.height = height;
    this.left = centerX - width / 2;
    this.right = this.left + width;
    this.top = centerY - height / 2;
    this.bottom = this.top + height;
    this.contains = function (boundary) {
        return (boundary.left < this.right &&
                boundary.right > this.left &&
                boundary.top < this.bottom &&
                boundary.bottom > this.top);
    };
    this.containsCenterOf = function (boundary) {
        return (boundary.centerX < this.right &&
                boundary.centerX > this.left &&
                boundary.centerY < this.bottom &&
                boundary.centerY > this.top);
    };
    // for checking mouseover
    this.containsPoint = function (x, y) {
        return (x < this.right &&
                x > this.left &&
                y < this.bottom &&
                y > this.top);
    };
    this.squareDistanceFromCenter = function (x, y) {
        var dx = this.centerX - x,
            dy = this.centerY - y;
        return dx * dx + dy * dy;
    };
}

function MapImagery(centerX, centerY, zoomLevel, imageURL) {
    'use strict';
    var self = this,
        mapSize = 128 * Math.pow(2, zoomLevel);
    this.ready = false;
    this.boundary = new Boundary(centerX, centerY, mapSize, mapSize);
    this.zoomLevel = zoomLevel;
    this.image = document.createElement('img');
    this.image.onload = function () {
        mainApp.mapCanvas.needUpdate = true;
        self.ready = true;
    };
    this.image.src = imageURL;
}

function Feature(x, y, imageURL) {
    'use strict';
    var self = this;
    this.ready = false;
    this.image = document.createElement('img');
    this.image.onload = function () {
        self.boundary = new Boundary(x, y, this.width, this.height);
        mainApp.mapCanvas.needUpdate = true;
        self.ready = true;
    };
    this.image.src = imageURL;
    this.distanceFrom = function (x1, y1) {
        return this.boundary.squareDistanceFromCenter(x1, y1);
    };
}

function Category(categoryName) {
    'use strict';
    this.name = categoryName;
    this.image = null;
    this.parent = null;
    this.children = [];
    this.features = {};
    this.isVisible = true;
}
function HierarchyMember() {
    'use strict';
    this.parentCat = null;
    this.children = [];
}

function MapData() {
    'use strict';
    var self = this;
    this.maps = [];
    this.categories = {};
    this.boundary = null;

    // orders maps from SE to NW, so that NW will be drawn on top of SE
    // this is to cover "map_x" text in the top left corner of each map
    this.sortMaps = function (a, b) {
        var comparator = 0;
        // draw low zoom[out] maps above high
        if (a.zoomLevel !== b.zoomLevel) {
            comparator = b.zoomLevel - a.zoomLevel;
        // for legacy maps that have text in upper left corner
        } else {
            // compare based on the coordinates with a bigger difference
            if (Math.abs(a.boundary.left - b.boundary.left) >
                    Math.abs(a.boundary.top - b.boundary.top)) {
                // sort descending (east to west)
                comparator =  b.boundary.left - a.boundary.left;
            } else {
                // sort descending (south to north)
                comparator = b.boundary.top - a.boundary.top;
            }
        }
        return comparator;
    };
    this.processMapData = function (mapData) {
        var maxX = -Infinity,
            maxY = -Infinity,
            minX = Infinity,
            minY = Infinity,
            mapImage,
            centerX,
            centerY;
        $.each(mapData, function (mapName, map) {
            if (mapData.hasOwnProperty(mapName)) {
                mapImage = new MapImagery(map['X coord'],
                                          map['Z coord'],
                                          map['Zoom level'],
                                          map['Image location']);
                // store in an array for ordered drawing later
                self.maps.push(mapImage);
                // determine the center of all maps
                if (mapImage.boundary.right > maxX) {
                    maxX = mapImage.boundary.right;
                }
                if (mapImage.boundary.left < minX) {
                    minX = mapImage.boundary.left;
                }
                if (mapImage.boundary.bottom > maxY) {
                    maxY = mapImage.boundary.bottom;
                }
                if (mapImage.boundary.top < minY) {
                    minY = mapImage.boundary.top;
                }
            }
        });
        this.maps.sort(this.sortMaps);
        // map coordinates of the center of the visible map
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
        // the bounds of all map images
        this.boundary = new Boundary(centerX, centerY,
                                     maxX - minX, maxY - minY);
    };
    // doesn't reference 'this'
    this.processFeatures = function (featureData, categoryIcon) {
        var featureName,
            feature,
            featureBoundary,
            // return value
            features = {},
            x,
            y;
        for (featureName in featureData) {
            if (featureData.hasOwnProperty(featureName)) {
                feature = featureData[featureName];
                x = feature['X coord'];
                // minecraft stores N/S as z
                y = feature['Z coord'];
                // ignore features without coordinates
                if (x !== null && y !== null) {
                    if (feature.Icon === null) {
                        feature.Icon = categoryIcon;
                    }
                    features[featureName] = new Feature(x, y,
                                                        feature.Icon);
                }
            }
        }
        return features;
    };
    this.processCategory = function (categoryName, categoryData, parentIcon) {
        var category = new Category(categoryName);
        // set category icon
        if (categoryData.Icon === null) {
            category.image = parentIcon;
        } else {
            category.image = categoryData.Icon;
        }
        // set category features
        category.features = this.processFeatures(categoryData.features,
                                                 category.image);
        $.each(categoryData.children, function (subcategoryName, subcategory) {
            if (categoryData.children.hasOwnProperty(subcategoryName)) {
                // add each subcategory as a child of the current category
                category.children.push(subcategoryName);
                // recurse, which creates self.categories[subcategoryName]
                self.processCategory(subcategoryName,
                                     subcategory,
                                     category.image);
                // add the current category as a parent of each subcategory
                self.categories[subcategoryName].parent = categoryName;
            }
        });
        this.categories[categoryName] = category;
    };
    this.processData = function (dataJson) {
        var data = JSON.parse(dataJson);
        // clear the data structures for storing all the data
        this.categories = {};
        this.maps = [];
        this.processMapData(data.maps);
        this.processCategory('Features', data.features, data.features.Icon);
        $(this).trigger('dataLoaded');
    };
    this.load = function () {
        // load json from sql database through php
        $.post('http://dogtato.net/mcmap/php/mapData.php',
               {action: 'get'})
            .done(function mapDataReceived(data) {
                self.processData(data);
            });
    };
    this.update = function () {
        // load json from sql database through php
        $.post('http://dogtato.net/mcmap/php/mapData.php',
               {action: 'update'})
            .done(function mapDataReceived(data) {
                self.processData(data);
            });
    };
}

function MapCanvas() {
    'use strict';
    var self = this;
    // set in init()
    this.svg = null;
    this.x = null;
    this.y = null;
    this.mapData = null;

    this.startTranslation = {x: 0, y: 0};
    this.lastTranslation = {x: 0, y: 0};
    this.viewCenter = {x: 0, y: 0};
    this.scale = 1;
    this.boundary = null;
    this.visibleFeatures = {};
    this.featureIconSize = 15;
    this.needUpdate = false;
    // http://stackoverflow.com/a/16265661/225730
    this.resizeSVG = function () {
        var w = window,
            d = document,
            e = d.documentElement,
            g = d.getElementsByTagName('body')[0],
            x = w.innerWidth || e.clientWidth || g.clientWidth,
            y = w.innerHeight|| e.clientHeight|| g.clientHeight;

        x = w.innerWidth || e.clientWidth || g.clientWidth;
        y = w.innerHeight|| e.clientHeight|| g.clientHeight;

        self.svg.attr("width", x)
                   .attr("height", y);
        d3.select('#mapoverlay').attr("width", x)
                                .attr("height", y);
        self.updateScale();
    };
    this.updateScale = function () {
        var viewBoxStr = self.svg.attr('viewBox'),
            viewBoxComponents,
            viewBoxWidth,
            viewBoxHeight,
            svgWidth,
            svgHeight,
            featureSize,
            featureWidth,
            featureHeight;
        if (viewBoxStr !== null) {
            viewBoxComponents = viewBoxStr.split(' ');
            viewBoxWidth = viewBoxComponents[2];
            viewBoxHeight = viewBoxComponents[3];
            svgWidth = self.svg.attr('width');
            svgHeight = self.svg.attr('height');
            self.scale = Math.min(svgHeight / viewBoxHeight, svgWidth / viewBoxWidth);
            featureSize = self.featureIconSize / self.scale,
            d3.selectAll('#featureGroup image')
                // scale so the largest dimension is featureSize
                .attr('width', function (d) {
                    if (d.feature.boundary.width > d.feature.boundary.height) {
                        featureWidth = featureSize;
                    }
                    else {
                        featureWidth = featureSize * d.feature.boundary.width / d.feature.boundary.height;
                    }
                    return featureWidth;
                })
                .attr('height', function (d) {
                    if (d.feature.boundary.width > d.feature.boundary.height) {
                        featureHeight = featureSize;
                    }
                    else {
                        featureHeight = featureSize * d.feature.boundary.height / d.feature.boundary.width;
                    }
                    return featureHeight;
                })
                .attr('x', function (d) {
                    return d.feature.boundary.centerX - featureWidth / 2;
                })
                .attr('y', function (d) {
                    return d.feature.boundary.centerY - featureHeight / 2;
                });
        }
    };
    this.init = function () {
        var canvasOffset;
        this.svg = d3.select('#mapcanvas');
        this.resizeSVG();
        window.onresize = this.resizeSVG;
        canvasOffset = $('#mapcanvas').offset();
        this.x = canvasOffset.left;
        this.y = canvasOffset.top;
        this.mapData = new MapData();
    };
    this.loadMap = function () {
        this.mapData.load();
        $(this.mapData).on('dataLoaded', function mapDataLoaded() {
            self.svg.attr('viewBox', function() {
                return self.mapData.boundary.left + ' ' +
                       self.mapData.boundary.top + ' ' +
                       self.mapData.boundary.width + ' ' +
                       self.mapData.boundary.height;
            })
                .attr('preserveAspectRatio', 'xMidYMid');
            self.updateScale();
            // // set initial transformation
            // self.viewCenter = {x: self.mapData.boundary.centerX,
            //                    y: self.mapData.boundary.centerY};
            // // scale to fit all the map images in the canvas
            // self.scale = Math.min(
            //     self.canvas.width() / self.mapData.boundary.width,
            //     self.canvas.height() / self.mapData.boundary.height
            // );
            // self.lastTranslation = {
            //     x: self.canvas.width() / 2 - self.viewCenter.x * self.scale,
            //     y: self.canvas.height() / 2 - self.viewCenter.y * self.scale
            // };
            // self.canvasContext.setTransform(self.scale, 0, 0, self.scale,
            //                                 self.lastTranslation.x,
            //                                 self.lastTranslation.y);
            self.needUpdate = true;
            $(self).trigger('canvasReady');
        });
    };
    // this._clear = function () {
    //     // clear canvas with a white background
    //     this.canvasContext.save();
    //     this.canvasContext.setTransform(1, 0, 0, 1, 0, 0);
    //     this.canvasContext.fillStyle = '#FFFFFF';
    //     this.canvasContext.fillRect(0, 0,
    //                                 this.svg.width(), this.svg.height());
    //     // reapply scale and translation
    //     this.canvasContext.restore();
    // };
    this._drawMaps = function () {
        var mapImagery,
            i;
        d3.select('#mapImageGroup').selectAll('image')
            .data(this.mapData.maps)
          .enter().append('image')
            .attr('xlink:href', function (d) {
                return d.image.src;
            })
            .attr('x', function (d) {
                return d.boundary.left;
            })
            .attr('y', function (d) {
                return d.boundary.top;
            })
            .attr('width', function (d) {
                return d.boundary.width;
            })
            .attr('height', function (d) {
                return d.boundary.height;
            });
        // for (i = 0; i < this.mapData.maps.length; i += 1) {
        //     mapImagery = this.mapData.maps[i];
        //     // check that map will be visible
        //     if (mapImagery.ready &&
        //         this.boundary.contains(mapImagery.boundary)) {
        //         this.canvasContext.drawImage(mapImagery.image,
        //                                      mapImagery.boundary.left,
        //                                      mapImagery.boundary.top,
        //                                      mapImagery.boundary.width,
        //                                      mapImagery.boundary.height);
        //     }
        // }
    };
    this._drawFeatures = function () {
        var // divide by scale to keep the icon size constant
            featureSize = this.featureIconSize / this.scale,
            // scaleFactor,
            // left,
            // top,
            width,
            height,
            categories = d3.select('#featureGroup').selectAll('g')
                .data(function convertCategoriesToArray() {
                    var categoryArray = [];
                    $.each(self.mapData.categories, function (categoryName, category) {
                        if (self.mapData.categories.hasOwnProperty(categoryName)) {
                            categoryArray.push({'name': categoryName,
                                                'features': category.features});
                        }
                    });
                    return categoryArray;
                })
              .enter().append('g')
                .attr('categoryId', function (d, i) {
                    return 'featureCategory' + i;
                });
        categories.selectAll('image')
            .data(function (d) {
                var featureArray = [];
                $.each(d.features, function (featureName, feature) {
                    if (d.features.hasOwnProperty(featureName)) {
                        featureArray.push({'name': featureName,
                                           'feature': feature});
                    }
                });
                return featureArray;
            })
          .enter().append('image')
            .attr('xlink:href', function (d) {
                return d.feature.image.src;
            })
            // scale so the largest dimension is featureSize
            .attr('width', function (d) {
                if (d.feature.boundary.width > d.feature.boundary.height) {
                    width = featureSize;
                }
                else {
                    width = featureSize * d.feature.boundary.width / d.feature.boundary.height;
                }
                return width;
            })
            .attr('height', function (d) {
                if (d.feature.boundary.width > d.feature.boundary.height) {
                    height = featureSize;
                }
                else {
                    height = featureSize * d.feature.boundary.height / d.feature.boundary.width;
                }
                return height;
            })
            .attr('x', function (d) {
                return d.feature.boundary.centerX - width / 2;
            })
            .attr('y', function (d) {
                return d.feature.boundary.centerY - height / 2;
            });
        // // store all features that get drawn
        // this.visibleFeatures = {};
        // // go through each category that's turned on
        // $.each(this.mapData.categories, function (categoryName, category) {
        //     if (self.mapData.categories.hasOwnProperty(categoryName) &&
        //             category.isVisible) {

        //         $.each(category.features, function (featureName, feature) {
        //             if (category.features.hasOwnProperty(featureName) &&
        //                     feature.ready &&
        //                     self.boundary.containsCenterOf(feature.boundary)) {
        //                 // scale so the largest dimension is featureSize
        //                 if (feature.boundary.width > feature.boundary.height){
        //                     scaleFactor = featureSize / feature.boundary.width;
        //                     width = featureSize;
        //                     height = feature.boundary.height * scaleFactor;
        //                 } else {
        //                     scaleFactor = featureSize / feature.boundary.height;
        //                     width = feature.boundary.width * scaleFactor;
        //                     height = featureSize;
        //                 }
        //                 left = feature.boundary.centerX - width / 2;
        //                 top = feature.boundary.centerY - height / 2;
        //                 // draw the feature
        //                 self.canvasContext.drawImage(feature.image, left, top,
        //                                              width, height);
        //                 // and store it for checking mouseover
        //                 self.visibleFeatures[featureName] = feature;
        //             }
        //         });
        //     }
        // });
    };
    // this is executed by setInterval so need to use self within
    this.draw = function () {
        // only redraw when needed (transformation changed, features toggled)
        if (self.needUpdate) {
            self.boundary = new Boundary(self.viewCenter.x, self.viewCenter.y,
                                         self.svg.attr('width') / self.scale,
                                         self.svg.attr('height') / self.scale,
                                         null);
            // self._clear();
            self._drawMaps();
            self._drawFeatures();
            self.needUpdate = false;
        }
    };
    this.getFeatureNear = function (x, y) {
        var nearbyFeature = null,
            // check for features within 20 pixels (squared for efficiency)
            // divide by scale to get map distance
            nearestDistance = 20 * 20 / this.scale,
            featureDistance;
        if (this.boundary !== null &&
                this.boundary.containsPoint(x, y)) {
            $.each(this.visibleFeatures, function (featureName, feature) {
                if (self.visibleFeatures.hasOwnProperty(featureName)) {
                    featureDistance = feature.distanceFrom(x, y);
                    if (featureDistance < nearestDistance) {
                        nearestDistance = featureDistance;
                        nearbyFeature = featureName;
                    }
                }
            });
        }
        return nearbyFeature;
    };
    this.startPan = function (pageX, pageY) {
        this.startTranslation = {
            x: pageX - this.x - this.lastTranslation.x,
            y: pageY - this.y - this.lastTranslation.y
        };
    };
    this.continuePan = function (pageX, pageY) {
        var newTranslation = {x: pageX - this.x - this.startTranslation.x,
                              y: pageY - this.y - this.startTranslation.y};
        this.canvasContext.setTransform(this.scale, 0, 0, this.scale,
                                        newTranslation.x, newTranslation.y);
        this.viewCenter = {
            x: (this.svg.width() / 2 - newTranslation.x) / this.scale,
            y: (this.svg.height() / 2 - newTranslation.y) / this.scale
        };
        this.needUpdate = true;
    };
    this.endPan = function (pageX, pageY) {
        this.lastTranslation = {
            x: pageX - this.x - this.startTranslation.x,
            y: pageY - this.y - this.startTranslation.y
        };
    };
    this.zoomIn = function (pageX, pageY) {
        var zoomFactor = 1.1;
        this.scale = this.scale * zoomFactor;
        // page - (page - trans) * zoomFactor
        this.lastTranslation = {
            x: pageX - (pageX - this.lastTranslation.x) * zoomFactor,
            y: pageY - (pageY - this.lastTranslation.y) * zoomFactor
        };
        this.canvasContext.setTransform(this.scale, 0, 0, this.scale,
                                        this.lastTranslation.x,
                                        this.lastTranslation.y);
        this.viewCenter = {
            x: (this.svg.width() / 2 - this.lastTranslation.x) / this.scale,
            y: (this.svg.height() / 2 - this.lastTranslation.y) / this.scale
        };
        this.needUpdate = true;
    };
    this.zoomOut = function (pageX, pageY) {
        var zoomFactor = 1.1;
        this.scale = this.scale / zoomFactor;
        // page - (page - trans) / zoomFactor
        this.lastTranslation = {
            x: pageX - (pageX - this.lastTranslation.x) / zoomFactor,
            y: pageY - (pageY - this.lastTranslation.y) / zoomFactor
        };
        this.canvasContext.setTransform(this.scale, 0, 0, this.scale,
                                        this.lastTranslation.x,
                                        this.lastTranslation.y);
        this.viewCenter = {
            x: (this.svg.width() / 2 - this.lastTranslation.x) / this.scale,
            y: (this.svg.height() / 2 - this.lastTranslation.y) / this.scale
        };
        this.needUpdate = true;
    };
    this.getMapPosition = function (pageX, pageY) {
        return {
            x: Math.round(
                (pageX - this.x - this.lastTranslation.x) / this.scale
            ),
            y: Math.round(
                (pageY - this.y - this.lastTranslation.y) / this.scale
            )
        };
    };
}

function FeatureInfo() {
    'use strict';
    var self = this;
    this.infoArea = $('#featureinfo');
    // cache data when feature is clicked
    this.infoCache = {};
    // set any links in the feature info to call this.load(link.title)
    this.redirectLinks = function () {
        this.infoArea.find('a').click(function followLink(clickEvent) {
            // don't follow the link
            clickEvent.preventDefault();
            // load the info in #featureinfo
            self.load(this.title);
        });
    };
    this.loadForm = function (formName) {
        var instructions,
            initialValue = '',
            extraInput = '',
            form,
            formArea = $('#editprompt');
        if (formName === 'Map') {
            initialValue = 'Map_';
        } else if (formName === 'Feature_Category') {
            extraInput = '<input type="hidden" value="Category" name="namespace" />';
        }
        // preliminary form to ask for the name of the data to create/edit
        form = ['<form action="http://dogtato.net/minecraft/index.php?title=Special:FormStart" method="get">',
                    '<input size="25" value="' + initialValue + '" class="formInput" name="page_name" />',
                    '<input type="hidden" value="Special:FormStart" name="title" />',
                    '<input type="hidden" value="' + formName + '" name="form" />',
                    extraInput,
                    '<input type="submit" value="Create or edit" />',
                '</form>'].join(' ');
        if (formName === 'Map') {
            instructions = 'Map number:';
        } else if (formName === 'Feature') {
            instructions = 'Feature name:';
        } else if (formName === 'Feature_Category') {
            instructions = 'Category name:';
        }
        formArea.html(instructions + form);
        formArea.slideDown(100);
        formArea.find('form').ajaxForm(function formResponse (data) {
            var url = 'http://dogtato.net/minecraft/index.php',
                pageName = data.match(/index\.php\?title\=([^"]+)/)[1],
                fullurl = url + '?title=' + pageName;
            // global editWindow
            if (editWindow === null || editWindow.closed) {
                editWindow = window.open(fullurl,
                                         'editWindow',"width=800,height=700");
            } else {
                editWindow.location.href = fullurl;
                editWindow.focus();
            }
            // could use this on the form that's loaded to show the update
            // on the map immediately
            // this.infoArea.find('form').ajaxForm(function formResponse (data) {
        });
    };
    this.load = function (featureName) {
        // standardize the case for caching
        var lowercaseName = featureName.toLowerCase();
        if (this.infoCache.hasOwnProperty(lowercaseName)) {
            this.infoArea.html(this.infoCache[lowercaseName]);
            this.redirectLinks();
        } else {
            $.post('http://dogtato.net/minecraft/index.php',
                   {title: featureName, action: 'render'})
                   // {title: featureName, printable: 'yes'})
                .done(function featureInfoLoaded(data) {
                    var header = '<h2>' + featureName + '</h2>';
                    self.infoArea.html(header + data);
                    // remove any edit links
                    self.infoArea.find('span.editsection').remove();
                    self.redirectLinks();
                    self.infoCache[lowercaseName] = self.infoArea.html();
                })
                // if page doesn't exist, load a form to create it
                .fail(function featureInfoNotLoaded(e) {
                    var nameEnd,
                        trimmedName;
                    if (e.status === 404) {
                        nameEnd = featureName.indexOf(' (page does not exist)');
                        trimmedName = featureName.slice(0, nameEnd);
                        self.loadFeatureForm(trimmedName);
                    }
                });
        }
    };
}

function MainApp() {
    'use strict';
    var self = this;
    this.mapCanvas = null;
    this.featureInfo = null;
    this.coordDisplay = null;
    this.mouseIsDown = false;
    this.clickedFeature = null;
    // set the handlers for when a category is toggled
    this.setCheckboxHandlers = function () {
        $('.categoryToggle').on('click', function updateCategories() {
            self.mapCanvas.mapData.categories[this.id].isVisible = this.checked;
            self.mapCanvas.needUpdate = true;
        });
    };
    this.createCheckBox = function (category) {
        var checkbox = ['<input',
                        'type="checkbox"',
                        'class="categoryToggle"',
                        'id="' + category.name + '"',
                        'checked="checked"',
                        '/>'].join(' '),
            image = ['<img',
                     'src="' + category.image + '"',
                     'height=10px',
                     'width=10px',
                     '/>'].join(' '),
            checkboxWithLabel = checkbox + image + category.name;
        return '<li><label>' + checkboxWithLabel + '</label></li>\n';
    };
    this.createCheckboxList = function (categoryName) {
        var category,
            subcategory,
            checkBoxHtml = '<ul>\n',
            i;
        category = this.mapCanvas.mapData.categories[categoryName];
        checkBoxHtml += this.createCheckBox(category);
        for (i = 0; i < category.children.length; i += 1) {
            subcategory = category.children[i];
            // recurse over children
            checkBoxHtml += this.createCheckboxList(subcategory);
        }
        checkBoxHtml += '</ul>\n';
        return checkBoxHtml;
    };
    this.createCheckboxes = function () {
        $('#layerlist').html(this.createCheckboxList('Features'));
        this.setCheckboxHandlers();
    };
    this.init = function () {
        this.mapCanvas = new MapCanvas();
        this.mapCanvas.init();
        this.featureInfo = new FeatureInfo();
        this.coordDisplay = $('#coorddisplay');
        this.mapCanvas.loadMap();
        $(this.mapCanvas).on('canvasReady', function mapCanvasReady() {
            self.createCheckboxes();
            self.mapCanvas.draw();
            // setInterval(self.mapCanvas.draw, 100); // start drawing
        });
    };
    this._setMouseoverBox = function (featureName, x, y) {
        var $mouseoverBox = $('#mouseoverbox');
        if (featureName === null) {
            $mouseoverBox.css('left', -1000);
            $mouseoverBox.css('top', -1000);
        } else {
            $mouseoverBox.html(featureName);
            $mouseoverBox.css('left', x);
            $mouseoverBox.css('top', y - 30);
        }
    };
    this.setCoordDisplay = function (x, z) {
        this.coordDisplay.html('x: ' + x + ' z: ' + z);
    };
    this.startMouse = function (pageX, pageY) {
        var mousePos;
        // check this in case the cursor was released outside the document
        // in which case the event would have been missed
        if (this.mouseIsDown) {
            this.mapCanvas.endPan(pageX, pageY);
        }
        this.mouseIsDown = true;
        this.mapCanvas.startPan(pageX, pageY);
        mousePos = this.mapCanvas.getMapPosition(pageX, pageY);
        this.clickedFeature = this.mapCanvas.getFeatureNear(mousePos.x,
                                                            mousePos.y);
    };
    this.moveMouse = function (pageX, pageY) {
        var mousePos = {x: 0, y: 0},
            nearbyFeature = null;
        // pan the map
        if (this.mouseIsDown) {
            this.mapCanvas.continuePan(pageX, pageY);
        // update cursor coordinates and check against features
        } else {
            mousePos = this.mapCanvas.getMapPosition(pageX,
                                                     pageY);
            this.setCoordDisplay(mousePos.x, mousePos.y);
            nearbyFeature = this.mapCanvas.getFeatureNear(mousePos.x,
                                                          mousePos.y);
        }
        // show feature name in mouse tooltip, or remove tooltip if
        // nearbyFeature is null
        this._setMouseoverBox(nearbyFeature, pageX, pageY);
        // clear so that click and drags won't cause a feature selection
        this.clickedFeature = null;
    };
    this.endMouse = function (pageX, pageY) {
        // check that the click started on the canvas
        if (this.mouseIsDown) {
            this.mouseIsDown = false;
            this.mapCanvas.endPan(pageX, pageY);
            this.mapCanvas.needUpdate = true;
            if (this.clickedFeature !== null) {
                this.featureInfo.load(this.clickedFeature);
            }
        }
    };
}


$(document).ready(function initialSetup() {
    'use strict';
    mainApp = new MainApp();
    mainApp.init();

    $('#mapoverlay').on({
        'mousedown': function canvasMouseButtonPressed(event) {
            mainApp.startMouse(event.pageX, event.pageY);
        },
        // provided by jquery.mousewheel.js
        'mousewheel': function canvasMouseScrolled(event) {
            if (event.deltaY > 0) {
                mainApp.mapCanvas.zoomIn(event.pageX,
                                         event.pageY);
            } else {
                mainApp.mapCanvas.zoomOut(event.pageX,
                                          event.pageY);
            }
        }
    });
    $(document.body).on({
        'mousemove': function bodyMouseover(event) {
            mainApp.moveMouse(event.pageX, event.pageY);
        },
        'mouseup': function bodyMouseup(event) {
            mainApp.endMouse(event.pageX, event.pageY);
        }
    });
    // reload map data from the database
    // for debugging
    // $('#getmapdata').on('click', function reloadMap() {
    //     mainApp.init();
    // });
    $('#reloaddata').on('click', mainApp.mapCanvas.mapData.load);
    $('#updatedata').on('click', mainApp.mapCanvas.mapData.update);
    $('#zoomout').on('click', function zoomOut() {
        mainApp.mapCanvas.zoomOut(mainApp.mapCanvas.canvas.width() / 2,
                                  mainApp.mapCanvas.canvas.height() / 2);
    });
    $('#zoomin').on('click', function zoomIn() {
        mainApp.mapCanvas.zoomIn(mainApp.mapCanvas.canvas.width() / 2,
                                  mainApp.mapCanvas.canvas.height() / 2);
    });
    $('#layerlist').hide();
    $('#layerheader').on('click', function showMapLayers() {
        $('#layerlist').slideToggle();
    });
    $('#editlist').hide();
    $('#editheader').on('click', function toggleEditLinks() {
        $('#editprompt').hide(0, function hideEditList() {
            $('#editlist').slideToggle(100);
        });
    });
    // annoying
    // $('#editbox').on('mouseleave', function hideEditPrompt() {
    //     $('#editprompt').slideUp(100, function hideEditList() {
    //         $('#editlist').slideUp(100);
    //     });
    // });
    $('#addfeature').on('click', function loadAddFeatureForm() {
        mainApp.featureInfo.loadForm('Feature');
    });
    $('#addcategory').on('click', function loadAddCategoryForm() {
        mainApp.featureInfo.loadForm('Feature_Category');
    });
    $('#addmap').on('click', function loadAddMapForm() {
        mainApp.featureInfo.loadForm('Map');
    });
});
