A component of a larger project. Automatically connect to Facebook and provide handlers for permission requests.

Importantly, this allows the user to interact with Facebook connect following best 
practices of requesting relevant permissions at the time they are required.

The following code is a simple implementation which posts a photo to the user's wall when a button is clicked.  
If the user has not previously provided the required permissions, or not logged in, they will be prompted to do so before the
post function is called.

```js
  $('button#post').click( function(event){
    tabbii.social.facebook.user.request_permissions(event, 'publish_actions', post);
  } )

  function post(){
    FB.api('me/photos', {
      url: 'http://example.com/image.jpg', 
      message: 'Hello world'
    }, 'post', function(){});
  }
```