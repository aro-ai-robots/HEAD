define(['application', 'marionette', './templates/timelines.tpl', 'd3', 'bootbox', './node',
        '../entities/node', 'underscore', 'jquery', '../entities/performance', 'lib/regions/fade_in', 'lib/speech_recognition',
        'lib/api', 'annyang', 'modules/settings/entities/node_config', 'jquery-ui', 'scrollbar',
        'scrollbar-css', 'scrollTo', 'font-awesome', 'jquery-mousewheel'],
    function(App, Marionette, template, d3, bootbox, NodeView, Node, _, $, Performance, FadeInRegion, speechRecognition,
             api, annyang, NodeConfig) {
        return Marionette.View.extend({
            template: template,
            cssClass: 'app-timeline-editor-container',
            config: {
                pxPerSec: 70,
                minPxPerSec: 5,
                maxPxPerSec: 300,
            },
            ui: {
                addNewButton: '.app-add-new-button',
                timelineContainer: '.app-timelines',
                editContainer: '.app-edit-container',
                timelineNodes: '.app-timeline-nodes .app-node',
                nodes: '.app-nodes .app-node',
                nodesContainer: '.app-nodes',
                nodeSettings: '.app-node-settings-container',
                scrollContainer: '.app-scroll-container',
                saveButton: '.app-save-button',
                runButton: '.app-run-button',
                stopButton: '.app-stop-button',
                pauseButton: '.app-pause-button',
                autoPauseButton: '.app-auto-pause-button',
                resumeButton: '.app-resume-button',
                loopButton: '.app-loop-button',
                runIndicator: '.app-run-indicator',
                timeIndicator: '.app-current-time div',
                deleteButton: '.app-delete-button',
                timeAxis: '.app-time-axis',
                doneButton: '.app-done-button',
                editButton: '.app-edit-button',
                previousButton: '.app-previous-button',
                nextButton: '.app-next-button',
                zoomInButton: '.app-zoom-in-button',
                zoomOutButton: '.app-zoom-out-button'
            },
            regions: {
                nodeSettings: {
                    el: '.app-node-settings-container',
                    regionClass: FadeInRegion
                }
            },
            events: {
                'click @ui.nodes': 'nodeClicked',
                'click @ui.saveButton': 'savePerformances',
                'click @ui.runButton': 'runAtIndicator',
                'click @ui.stopButton': 'stop',
                'click @ui.pauseButton': 'pause',
                'click @ui.resumeButton': 'resume',
                'click @ui.timeAxis': 'moveIndicatorCallback',
                'click @ui.deleteButton': 'deletePerformance',
                'click @ui.doneButton': 'done',
                'click @ui.loopButton': 'loop',
                'click @ui.autoPauseButton': 'toggleAutoPause',
                'click @ui.editButton': 'editCurrent',
                'click @ui.previousButton': 'editPrevious',
                'click @ui.nextButton': 'editNext',
                'mousewheel @ui.scrollContainer': 'zoomCallback',
                'click @ui.zoomInButton': 'zoomIn',
                'click @ui.zoomOutButton': 'zoomOut'
            },
            initialize: function(options) {
                let self = this
                this.mergeOptions(options, ['performances', 'autoplay', 'readonly', 'disableSaving', 'layoutView',
                    'queue', 'allowEdit', 'queueItem', 'skipLoading'])
                this.nodeConfig = new NodeConfig({}, {node_name: '/performances'})
                this.listenTo(this.nodeConfig, 'change', this.reconfigure)
                this.nodeConfig.fetch()
                this.configRefreshInterval = setInterval(function() {
                    if (self.isDestroyed())
                        clearInterval(self.configRefreshInterval)
                    else
                        self.nodeConfig.fetch()
                }, 1000)
            },
            changed: false,
            markChanged: function() {
                this.changed = true
            },
            childViewOptions: function() {
                return {performance: this.model, config: this.config}
            },
            done: function() {
                let self = this
                this.layoutView.changeCheck(function() {
                    self.close()
                })
            },
            backup: function() {
                this.changed = false
                this.performanceBackup = this.model.toJSON()
            },
            revert: function() {
                if (this.performanceBackup) {
                    this.model.clear({silent: true})
                    this.model.set(this.performanceBackup)
                }
            },
            close: function() {
                this.trigger('close')
            },
            editCurrent: function() {
                this.layoutView.editCurrent()
            },
            editPrevious: function() {
                this.layoutView.editPrevious(this.queueItem)
            },
            editNext: function() {
                this.layoutView.editNext(this.queueItem)
            },
            reconfigure: function() {
                if (this.nodeConfig.get('autopause')) {
                    this.ui.autoPauseButton.addClass('active')
                } else {
                    this.ui.autoPauseButton.removeClass('active').blur()
                }
            },
            toggleAutoPause: function() {
                this.setAutoPause(!this.nodeConfig.get('autopause'))
            },
            setAutoPause: function(val) {
                this.nodeConfig.save({autopause: val})
            },
            loadPerformance: function() {
                let self = this,
                    loadOptions = {
                        success: function() {
                            self.backup()
                            if (self.autoplay) self.run()
                            if (!self.readonly) {
                                let reload = function() {
                                    self.model.loadPerformance()
                                }
                                self.listenTo(self.model.nodes, 'change add remove', reload)
                                self.listenTo(self.model.nodes, 'change', self.markChanged)
                            }
                        }
                    }

                if (this.model) {
                    if (this.skipLoading) {
                        loadOptions.success()
                    } else if (this.model.id && this.model.nodes.isEmpty()) {
                        this.model.load(loadOptions)
                    } else if (!this.readonly)
                        this.model.loadPerformance(loadOptions)
                } else {
                    this.model = new Performance()
                    this.model.fetchCurrent(loadOptions)
                }
            },
            onAttach: function() {
                let self = this

                this.loadPerformance()
                if (this.readonly) {
                    this.ui.editContainer.hide()
                    this.ui.timelineContainer.addClass('readonly')
                }

                this.ui.doneButton.fadeIn()
                this.ui.scrollContainer.droppable({
                    accept: '[data-node-name], [data-node-id]',
                    tolerance: 'touch',
                    drop: function(e, ui) {
                        let el = $(ui.helper),
                            id = el.data('node-id'),
                            node = Node.all().get(id),
                            startTime = Math.round(
                                    ($(this).scrollLeft() + ui.offset.left - $(this).offset().left) / self.config.pxPerSec * 100) / 100

                        if (id && node) {
                            node.set('start_time', startTime)
                            self.model.nodes.add(node)
                            self.showNodeSettings(node)
                        }
                    }
                })

                this.ui.previousButton.hide()
                this.ui.nextButton.hide()

                if (this.readonly) {
                    this.ui.nodesContainer.hide()
                    this.ui.doneButton.hide()
                } else {
                    this.nodeView = new NodeView({collection: this.model.nodes})
                    this.getRegion('nodeSettings').show(this.nodeView)
                    this.ui.editButton.hide()
                }

                this.ui.scrollContainer.perfectScrollbar()

                let eventCallback = function(msg) {
                    if (self.isDestroyed())
                        api.topics.performance_events.unsubscribe(eventCallback)
                    else
                        self.handleEvents(msg)
                }
                api.topics.performance_events.subscribe(eventCallback)

                this.queueUpdated()
                this.listenTo(this.queue, 'add remove reset', this.queueUpdated)

                // hide delete and clear buttons for new models
                if (!this.model.get('id')) {
                    this.ui.deleteButton.hide()
                }

                this.listenTo(this.model.nodes, 'add', this.addNode)
                this.listenTo(this.model.nodes, 'reset', this.arrangeNodes)
                this.listenTo(this.model.nodes, 'remove', this.removeNode)
                this.removeNodeElements()
                this.arrangeNodes()

                // add resize event
                let updateWidth = function() {
                    if (self.isDestroyed())
                        $(window).off('resize', updateWidth)
                    else
                        self.updateTimelineWidth()
                }

                $(window).on('resize', updateWidth)

                if (this.options.paused)
                    this.pauseIndicator(this.options.current_time)
                else if (this.options.running)
                    this.startIndicator(this.options.current_time, this.model.getDuration())
                else
                    this.stopIndicator()
            },
            queueUpdated: function() {
                if (!this.isDestroyed()) {
                    if (this.readonly) {
                        $([this.ui.nextButton, this.ui.previousButton]).hide()
                        if (this.allowEdit) this.ui.editButton.fadeIn()
                        else this.ui.editButton.fadeOut()
                    } else {
                        if (this.queue.length > 1 && this.queueItem) {
                            let pos = this.queue.findIndex(this.queueItem)
                            if (pos !== -1) {
                                if (pos > 0) this.ui.previousButton.fadeIn()
                                else this.ui.previousButton.fadeOut()

                                if (pos < this.queue.length - 1) this.ui.nextButton.fadeIn()
                                else this.ui.nextButton.fadeOut()
                            } else {
                                this.hideEditNav()
                            }
                        } else {
                            this.hideEditNav()
                        }
                    }
                }
            },
            zoomIn: function() {
                this.zoom(true, 2)
            },
            zoomOut: function() {
                this.zoom(false, 2)
            },
            zoomCallback: function(e) {
                e.preventDefault()
                this.zoom(e.deltaY > 0)
            },
            zoom: function(magnify, power) {
                power = power || 1
                this.config.pxPerSec = Math.max(
                    this.config.minPxPerSec,
                    Math.min(this.config.pxPerSec + (magnify ? 10 : -10) * power, this.config.maxPxPerSec))
                this.updateNodes()
                this.updateTimelineWidth()
                this.updateIndicatorTime(this.indicatorTime)
            },
            removeNodeElements: function() {
                let self = this
                this.model.nodes.each(function(node) {
                    self.removeNode(node)
                })
            },
            nodeClicked: function(e) {
                let node = Node.create({
                    name: $(e.target).data('name'),
                    start_time: 0,
                    duration: 1
                })

                this.model.nodes.add(node)
            },
            initResizable: function(el) {
                let self = this,
                    handle = $('<span>').addClass('ui-resizable-handle ui-resizable-e ui-icon ui-icon-gripsmall-diagonal-se')

                $(el).append(handle).resizable({
                    handles: 'e',
                    resize: function() {
                        let node = self.model.nodes.get({cid: $(this).data('node-id')})
                        node.set('duration', Math.round($(this).outerWidth() / self.config.pxPerSec * 100) / 100)
                    }
                })
            },
            createNodeEl: function(node) {
                let self = this,
                    el = $('<div>').addClass('app-node label')
                        .attr('data-node-name', node.get('name'))
                        .attr('data-node-id', node.cid)
                        .on('click', function() {
                            self.showNodeSettings(node)
                        })

                node.set('el', el.get(0), {silent: true})
                this.listenTo(node, 'change', this.placeNode)
                this.listenTo(node, 'change', this.focusNode)
                this.listenTo(node, 'change', this.updateNodeEl)
                this.updateNodeEl(node)

                if (!this.readonly) {
                    el.draggable({
                        helper: 'clone',
                        appendTo: 'body',
                        revert: 'invalid',
                        delay: 100,
                        snap: '.app-timeline-nodes',
                        snapMode: 'inner',
                        zIndex: 1000,
                        start: function() {
                            // hide original when showing clone
                            $(this).hide()
                        },
                        stop: function() {
                            $(this).show()
                        }
                    })

                    if (node.hasProperty('duration'))
                        this.initResizable(el)
                }
            },
            updateNodes: function() {
                let self = this
                this.model.nodes.each(function(node) {
                    self.updateNodeEl(node)
                })
            },
            /**
             * Updates node element
             *
             * @param node Node
             */
            updateNodeEl: function(node) {
                let el = $(node.get('el'))
                if (el.length) {
                    el.stop().css({
                        left: node.get('start_time') * this.config.pxPerSec,
                        width: node.get('duration') * this.config.pxPerSec
                    }).attr('data-node-name', node.get('name'))

                    if (el.is(':empty'))
                        el.html(node.getTitle())
                    else
                        el.get(0).childNodes[0].nodeValue = node.getTitle()
                }
            },
            showNodeSettings: function(node) {
                if (this.readonly) return
                this.ui.timelineContainer.find('.app-node').removeClass('active')
                if (node.get('el')) $(node.get('el')).addClass('active')
                this.nodeView.showSettings(node)
            },
            addNode: function(node) {
                this.placeNode(node)
                this.updateTimelineWidth()
                this.focusNode(node)
            },
            focusNode: function(node) {
                let el = $(node.get('el'))
                if (el.length)
                    this.ui.scrollContainer.scrollTo(el)
            },
            removeNode: function(node) {
                this.stopListening(node)

                let el = $(node.get('el'))
                if (el.length)
                    el.remove()
                node.unset('el', {silent: true})
                this.removeEmptyTimelines()
                this.updateTimelineWidth()
            },
            arrangeNodes: function() {
                let self = this

                this.ui.timelineContainer.find('.app-timeline-nodes').remove()
                this.model.nodes.each(function(node) {
                    self.placeNode(node)
                })

                this.removeEmptyTimelines()
                this.updateTimelineWidth()
            },
            removeEmptyTimelines: function() {
                let timelines = $('.app-timeline-nodes', this.el)
                timelines.filter(':empty').remove()
                if (!timelines.length)
                    this.addTimeline()
            },
            placeNode: function(node) {
                let self = this,
                    begin = node.get('start_time'),
                    end = begin + node.get('duration'),
                    available = false,
                    el = $(node.get('el'))

                if (!el.length) {
                    self.createNodeEl(node)
                    el = $(node.get('el'))
                }

                $('.app-timeline-nodes', self.ui.timelineContainer).each(function() {
                    available = true

                    $('.app-node', this).each(function() {
                        let model = self.model.nodes.findWhere({'el': this})

                        if (model && model != node) {
                            let compareBegin = model.get('start_time'),
                                compareEnd = compareBegin + model.get('duration')

                            // check if intersects
                            if (!(compareBegin >= end || compareEnd <= begin)) {
                                available = false
                            }
                        }

                        return available
                    })

                    if (available) $(this).append(node.get('el'))
                    return !available
                })

                if (!available) {
                    self.addTimeline()
                    $('.app-timeline-nodes:last-child').append(el)
                }
            },
            addTimeline: function() {
                this.ui.timelineContainer.append($('<div>').addClass('app-timeline-nodes'))
            },
            getTimelineWidth: function() {
                return this.model.getDuration() * this.config.pxPerSec
            },
            updateTimelineWidth: function() {
                let timelineWidth = this.getTimelineWidth(),
                    containerWidth = this.ui.timelineContainer.width(),
                    width = Math.max(timelineWidth, containerWidth),
                    scale = d3.scaleLinear().domain([0, width / this.config.pxPerSec]).range([0, width])

                // update axis
                this.ui.timeAxis.html('').width(width)
                d3.select(this.ui.timeAxis.get(0)).call(d3.axisBottom().scale(scale))

                if (timelineWidth < containerWidth || !containerWidth)
                    width = '100%'

                this.ui.timelineContainer.find('.app-timeline-nodes').css('width', width)
                this.ui.scrollContainer.perfectScrollbar('update')
            },
            sortPerformances: function() {
                this.performances.sort()
            },
            savePerformances: function() {
                let self = this

                this.model.save({}, {
                    success: function(model) {
                        if (self.performances) self.performances.add(model)
                        if (!self.isDestroyed()) {
                            self.readonly = false
                            self.ui.deleteButton.fadeIn()
                            self.ui.nodesContainer.fadeIn()

                            if (model.get('error')) {
                                App.Utilities.showPopover(self.ui.saveButton, model.get('error'))
                                model.unset('error')
                            } else {
                                self.backup()
                                App.Utilities.showPopover(self.ui.saveButton, 'Saved')
                            }
                        }
                    }
                })
            },
            startIndicator: function(startTime, endTime, callback) {
                let self = this
                this.paused = false
                this.ui.runButton.hide()
                this.ui.resumeButton.hide()
                this.ui.stopButton.fadeIn()
                this.ui.pauseButton.fadeIn()

                if (this.ui.runIndicator.draggable('instance'))
                    this.ui.runIndicator.draggable('destroy')

                this.ui.runIndicator.stop().css('left', startTime * this.config.pxPerSec)
                    .animate({left: endTime * this.config.pxPerSec}, {
                        duration: (endTime - startTime) * 1000,
                        easing: 'linear',
                        step: function() {
                            if (self.isDestroyed()) return
                            self.updateIndicatorTime()
                        },
                        complete: function() {
                            if (self.isDestroyed()) return
                            if (typeof callback === 'function')
                                callback()
                        }
                    })
            },
            indicatorTime: 0,
            updateIndicatorTime: function(time, dragging) {
                let position = parseInt(this.ui.runIndicator.css('left')),
                    width = this.ui.scrollContainer.innerWidth(),
                    maxScroll = this.model.getDuration() * this.config.pxPerSec - width

                if ($.isNumeric(time)) {
                    position = time * this.config.pxPerSec
                    this.ui.runIndicator.stop().animate({left: position})
                } else
                    time = parseInt(position) / this.config.pxPerSec

                this.indicatorTime = time
                this.trigger('change:time', time)

                this.ui.timeIndicator.html(time.toFixed(2))

                if (this.running && !this.paused || !dragging)
                    this.ui.scrollContainer.scrollLeft(Math.max(0, time * this.config.pxPerSec - this.config.pxPerSec))
                else {
                    let current = this.ui.scrollContainer.scrollLeft()
                    if (position < current + width * 0.2 || position > current + width * 0.8)
                        this.ui.scrollContainer.stop().scrollLeft(Math.max(0, Math.min(maxScroll,
                            current + (position - current - width * 0.5) / width * this.config.pxPerSec))
                        )
                }
            },
            resetButtons: function() {
                this.ui.runButton.fadeIn()
                this.ui.stopButton.hide()
                this.ui.pauseButton.hide()
                this.ui.resumeButton.hide()
            },
            pauseIndicator: function(time) {
                this.ui.runIndicator.stop().css('left', time * this.config.pxPerSec)
                this.pausePosition = parseInt(this.ui.runIndicator.css('left'))
                this.updateIndicatorTime()
                this.enableIndicatorDragging()
                this.ui.runButton.hide()
                this.ui.pauseButton.hide()
                this.ui.resumeButton.fadeIn()
                this.ui.stopButton.fadeIn()
            },
            enableIndicatorDragging: function() {
                let self = this

                this.ui.runIndicator.draggable({
                    axis: "x",
                    drag: function() {
                        self.updateIndicatorTime(null, {dragging: true})
                    },
                    stop: function(event, ui) {
                        let endPixels = self.model.getDuration() * self.config.pxPerSec
                        if (ui.position.left < 0) {
                            self.updateIndicatorTime(0)
                        } else if (ui.position.left > endPixels) {
                            self.updateIndicatorTime(endPixels / self.config.pxPerSec)
                        }
                    }
                })
            },
            stopIndicator: function() {
                this.enableIndicatorDragging()
                this.updateIndicatorTime(0)
                this.resetButtons()

                this.trigger('idle')

                if (this.enableLoop)
                    this.run()
            },
            moveIndicatorCallback: function(e) {
                this.moveIndicator(Math.min(e.offsetX / this.config.pxPerSec, this.model.getDuration()), {
                    disableScroll: true
                })
            },
            moveIndicator: function(time, options) {
                if (!this.running || this.paused) {
                    this.updateIndicatorTime(time, options)
                }
            },
            run: function(startTime, options) {
                if (!options) options = {}

                if (!$.isNumeric(startTime))
                    startTime = 0

                this.model.run(startTime, {
                    success: function(model, response) {
                        if (typeof options.success == 'function')
                            options.success(model, response)
                    },
                    error: function(error) {
                        if (typeof options.error == 'function')
                            options.error(error)

                        console.log(error)
                    }
                })
            },
            stop: function() {
                this.loop(false)
                this.model.stop({
                    error: function(error) {
                        console.log(error)
                    }
                })
            },
            pause: function() {
                this.model.pause({
                    error: function(error) {
                        console.log(error)
                    }
                })
            },
            resume: function() {
                if (this.paused && parseInt(this.ui.runIndicator.css('left')) == this.pausePosition)
                    this.model.resume({
                        error: function(error) {
                            console.log(error)
                        }
                    })
                else
                    this.runAtIndicator()
            },
            runAtIndicator: function() {
                this.run(1. * parseInt(this.ui.runIndicator.css('left')) / this.config.pxPerSec)
            },
            loop: function(enable) {
                if (typeof enable == 'boolean' && !enable || this.enableLoop) {
                    this.enableLoop = false
                    this.ui.loopButton.removeClass('active').blur()
                } else {
                    this.enableLoop = true
                    this.ui.loopButton.addClass('active')
                }
            },
            deletePerformance: function() {
                let self = this

                bootbox.confirm("Are you sure?", function(result) {
                    if (result)
                        self.$el.fadeOut(null, function() {
                            self.model.destroy()

                            if (self.layoutView.queueCollection.length)
                                self.layoutView.editCurrent()
                            else
                                self.layoutView.refreshCurrentPerformance()
                        })
                })
            },
            hideEditNav: function() {
                this.ui.editButton.fadeOut()
                this.ui.previousButton.fadeOut()
                this.ui.nextButton.fadeOut()
            },
            handleEvents: function(e) {
                let duration = this.model.getDuration()
                if (e.event === 'paused') {
                    this.paused = true
                    this.pauseIndicator(e.time)
                    this.model.b_pause(e)
                    this.queueUpdated()
                } else if (e.event === 'idle') {
                    this.running = false
                    this.paused = false
                    this.stopIndicator()
                    this.queueUpdated()
                } else if (e.event === 'running') {
                    this.running = true
                    this.startIndicator(e.time, duration)
                    this.hideEditNav()
                } else if (e.event === 'resume') {
                    this.startIndicator(e.time, duration)
                    this.hideEditNav()
                } else if (e.event === 'chat')
                    this.enableChat()
                else if (e.event === 'chat_end')
                    this.disableChat()
            },
            enableChat: function() {
                if (annyang) {
                    annyang.abort()
                    annyang.removeCommands()
                    annyang.setLanguage('en-US')
                    annyang.addCallback('start', function() {
                        console.log('starting speech recognition')
                    })
                    annyang.addCallback('end', function() {
                        console.log('end of speech')
                    })
                    annyang.addCallback('error', function(error) {
                        console.log('speech recognition error:')
                        console.log(error)
                    })
                    annyang.addCallback('result', function(results) {
                        if (results.length) {
                            api.topics.listen_node_input.publish({data: results[0]})
                            api.loginfo('speech recognised: ' + results[0])
                        }
                    })
                    annyang.start({
                        autoRestart: true,
                        continuous: true,
                        paused: false
                    })
                }
            },
            disableChat: function() {
                if (annyang) annyang.abort()
            }
        })
    })
