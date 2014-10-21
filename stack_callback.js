//=require underscore
//=require tabbii/internals
;/**
A callback queue container. Functions can be `push`ed to an instance of _stack_callback_ and triggered at any time. 

The best use for this function is building scripts which may only execute under certain conditions that can occur at any time.

If the _stack_callback_ is already in a triggered state, any functions pushed to it will be immediately invoked. 

The _stack_callback_ can be stopped at any time to resume queuing.

Callbacks queues can be created which trigger on edge events.

Alternatively, if `refire` and `requeue` options are used, the _stack_callback_ will be stopped once emptied and all functions moved back on to the queue. 
@typedef {Object} tabbii.internals.stack_callback
@namespace tabbii.internals.stack_callback
@constructor
@prop {Object} bind|options - scope for callback or an object of options
@prop {Array} [prepopulated_stack] - functions to add to the queue on construction.
*/
tabbii.internals.stack_callback = (function(bind, prepopulated_stack){
  // Internally, reference all accessible variables via "scope"
  var scope = this;
  var triggered = false;
  var trigger_event_listener, stop_event_listener;
  if(arguments.length == 1 && 'object' == typeof arguments[0]){
    var options            = arguments[0];
    scope.bind             = options.bind;
    scope.refire           = options.refire;
    scope.requeue          = options.requeue;
    prepopulated_stack     = options.prepopulated_stack;
    _.defer(function(){
      scope.addTriggerEventListener(options.trigger_callback);
      scope.addStopEventListener(options.stop_callback);
    })
  } else {
    scope.bind = bind || undefined;
    scope.refire = false;
    scope.requeue = false;
  }
  
  var stack = new Array
  perfect_prepopulated_stack = _.chain([prepopulated_stack]).flatten().compact().flatten().value();
  stack = stack.concat(perfect_prepopulated_stack)

  /**
  Add callbacks to the stack.
  @prop {(function|function[])} callback - functions to append to the queue
  
  @function push
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.push = function(){
    stack.push.apply(stack,arguments);
    return scope; // for chaining
  }

  /**
  Begin invoking functions on the stack and continue to invoke any functions immediately when added.
  
  @function trigger
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.trigger = function(){
    if(triggered) return false;
    triggered = true;
    dequeue();
    watch_stack();
    
    if(trigger_event_listener instanceof scope.constructor)
      trigger_event_listener.trigger();   
  }

  /**
  Stop invoking functions on the stack and resume queuing.
  
  __Note__: unstacking is performed in an undeferred loop, so any functions already on a triggered _stack_callback_ will be invoked before stopping.
  
  @function stop
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.stop = function(){
    if(!triggered) return false;
    triggered = false;
    // Return push function to its original Array default
    stack.push = function (){ Array.prototype.push.apply(this,arguments); }
    if(stop_event_listener instanceof scope.constructor)
      stop_event_listener.trigger(); 
  }
  
  /**
  Removes a callback from the stack. Must be a reference to the exact instance which was originally queued. 
  
  @prop {function} callback_to_remove - a reference to the function object to remove from the queue.
  @function remove
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.remove = function(callback_to_remove){
    stack.splice( _.indexOf(stack, callback_to_remove), 1 );
  }
  
  /**
  Removes all callbacks from the stack.
    
  @function empty
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.empty = function(){
    stack.splice(0, stack.length);
  }
  
  /**
  Add a callback to invoke whenever the _stack_callback_ is triggered. 
  
  Fires only on the trigger edge.
  
  Internally uses an instance of _stack_callback_ to manage a callback queue which can be added to at any time.
  
  @prop {(function|function[])} callback - functions to append to the event queue
  @function addTriggerEventListener
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.addTriggerEventListener = function(responder){
    if('function' != typeof responder) return false;
    if(!(trigger_event_listener instanceof scope.constructor)){
      trigger_event_listener = new scope.constructor({
        bind : scope.bind,
        refire : true, 
        requeue : true
      });
    }
    trigger_event_listener.push(responder);
  }

  /**
  Add a callback to invoke whenever the _stack_callback_ is stopped. 
  
  Fires only on the stop edge.
  
  Internally uses an instance of _stack_callback_ to manage a callback queue which can be added to at any time.
  
  @prop {(function|function[])} callback - functions to append to the event queue
  @function addStopEventListener
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.addStopEventListener = function(responder){
    if('function' != typeof responder) return false;
    if(!(stop_event_listener instanceof scope.constructor)){
      stop_event_listener = new scope.constructor({
        bind : scope.bind,
        refire : true, 
        requeue : true
      });
    }
    stop_event_listener.push(responder);
  }
  
  scope._debug = function(){
    console.log('Triggered:', triggered)
    console.log(stack);
    if(trigger_event_listener instanceof scope.constructor) trigger_event_listener._debug();
    if(stop_event_listener instanceof scope.constructor) stop_event_listener._debug();
  }
  
  /**
  Returns the state of the _stack_callback_ instance.
  
  @returns {String} - Either `triggered` or `waiting`
  @function state
  @memberof tabbii.internals.stack_callback
  @instance
  */
  scope.state = function(){
    return triggered ? 'triggered' : 'waiting'
  }
  
  var watch_stack = function(){
    stack.push = function (){
      push = Array.prototype.push.apply(this,arguments);
      dequeue()
      return push;
    }
  }
  
  var dequeue = function(){
    // This is where the magic happens
    if(scope.requeue){
      var stack_copy = stack.slice(0);
    }
    while(fn = stack.shift()){ // to reverse use 'pop' 
      if('function' == typeof fn) (fn).apply(scope.bind);
      //executed.push(fn);
    } 
    if(scope.refire){
      if(stack.length) console.log("Stack error. Unexecuted functions remaining on stack", stack);
      // Once all current callbacks have been called, this point is reached.
      // refire is an option to automatically stop for single-shot trigger.
      // requeue is an option to add all callbacks to the stack again.
      // After this stack_callback is triggered, newly pushed callbacks 
      // will not be executed again until trigger is called once more.
      scope.stop();
      if(scope.requeue){
        // Push the array into stack (flattened)
        Array.prototype.push.apply(stack, stack_copy);
      }
    }
    if(!scope.refire && !!scope.requeue){
      console.log('Refire must be enabled to use Requeue');
    }
    

  }

});

/**

For complex event sequences, _push_all_ will wait for all passed _stack_callback_ s to be triggered before calling the final function.

@example 
  var a = new tabbii.internals.stack_callback
  var b = new tabbii.internals.stack_callback
  var c = new tabbii.internals.stack_callback
  var z = function(){ alert('all stack callbacks triggered') }
  tabbii.internals.stack_callback.push_all(a, b, c, z);
  
  c.trigger(); // Nothing happens
  a.trigger(); // Nothing happens
  b.trigger(); // function z is called, displaying an alert.
  

@static
@memberof tabbii.internals.stack_callback
@prop {tabbii.internals.stack_callback[]|function} arguments - multiple _stack_callback_ instances followed by a function

*/
tabbii.internals.stack_callback.push_all = function(){
  var callback, stacks = new Array
  _.each(arguments, function(argument){
    if(argument instanceof tabbii.internals.stack_callback)
      stacks.push({
        stack_callback : argument, 
        triggered : false,
      })
    if(_.isFunction(argument))
      callback = argument
  })
  if(!callback) {
    console.groupCollapsed("Stack Push All missing a final callback function.");
    console.log(arguments);
    console.trace(this);
    console.groupEnd();
    return false;
  }
  var final_callback = _.once( callback );
  _.each(stacks, function(stack){
    var fire_if_ready = _.bind(function(){
      this.triggered = true;
      if( _.every(stacks, function(stack){return stack.triggered}) )
        final_callback.call();
    }, stack);
    var untriggered = _.bind(function(){
      this.triggered = false;
    }, stack)
    stack.stack_callback.push (fire_if_ready);
    stack.stack_callback.addTriggerEventListener (fire_if_ready);
    stack.stack_callback.addStopEventListener (untriggered);
  });
}
