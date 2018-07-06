jsPsych.plugins['mot-game'] = (function(){
  var plugin = {};

  plugin.info = {
    name: 'mot-game';
    parameters: {
      duration: 15000
      ball_speed: 0.04
      num_regular_balls: 7
      num_exploding_balls: 2
      max_user_defined_obstacles: 1
      max_user_defined_obstacle_segments: 3 //max_pixels: max_segments + 1
      max_distance_between_obstacle_pixels:300
      min_distance_between_obstacle_pixels: 66
      gameWidth: 650
      gameHeight: 650
    }
  }

  plugin.trial = function(display_element, trial) {
    var par = plugin.info.parameters
    
    var w=par.gameWidth, h=par.gameHeight;
    display_element.innerHTML = "<!--main canvas where game happens:-->" +
    "<canvas id='mainCanvas' height='" + h + "' width = '" + w + "'></canvas>" + "<button onclick='curLevel.beginGame()'>S T A R T</button>"
    +
    "<!--overlay canvas that doesn't need to be refreshed constantly:-->" +
    //it may be good to not hard-code the top and left value but rather use variables...this will be decided later when we do more styling
    "<canvas id='overlay' style='position:absolute; left: 0; top: 0; z-index:2' height='" + h + "' width = '" + w + "'></canvas>"
    +
    "<!--selection canvas for ball selection in defusal mode:-->" +
    //it may be good to not hard-code the top and left value but rather use variables...this will be decided later when we do more styling
    "<canvas id='selectionCanvas' style='position:absolute; left: 0; top: 0; z-index:1' height='" + h + "' width = '" + w + "'></canvas>";

    var data = {
      levelDuration: duration
      timeFinished: 0
      defusalMode: "neverNeeded" //"neverNeeded", "successful", or "failure"
      numWallsMade: 0/*should it register each click?*/:
      numRegBalls: par.num_regular_balls
      numExplodingBalls: par.num_exploding_balls
      ballSpeed: par.ball_speed
      maxObstacles: par.max_user_defined_obstacles
      maxObstacleSegments:par.max_user_defined_obstacle_segments
      maxSegmentLength:par.max_user_defined_obstacle_segment_length
      minSegmentLength:par.min_user_defined_obstacle_segment_length
    }


    /*GAME CODE*/
    var ballColor = "grey"

    var distanceBetween = function(p1, p2){
      var xdist = p2[0]-p1[0]
      var ydist = p2[1]-p1[1]
      return Math.sqrt(xdist*xdist + ydist*ydist)
    }

    //pix has format [x,y]
    function getPixelPositionRelativeToObject(pix, object) {
      var posx = pix[0]-object.offsetLeft
      var posy = pix[1]-object.offsetTop
      //this resets any out-of-bounds pixels to within-bounds
      if(posx >= object.width){posx = object.width-1}
      if(posx <= 0){posx = 1}
      if(posy >= object.height){posy = object.height-1}
      if(posy <= 0){posy = 1}
      return [posx, posy]
    }

    function levelZero() {
      var levelDuration = 15000;
      var m = new model(1,1,/*0.1*/0.04)
      var v = new view()
      var c = new controller(m, v, levelDuration)
      return new level(m, v, c, levelDuration)
    }
    curLevel = levelZero();

    function model(numBalls, numExplodingBalls, speed) {
      this.frozen = false //game pauses and model freezes
      this.freeze = function(){this.frozen = true}
      this.currentTime = 0
      this.balls = []; //including exploding balls
      this.explodingBalls = [];
      this.numExplodingBalls = function(){return this.explodingBalls.length}

      //initialize the balls:
      var ballRadius = 20
      for(var i = 0; i<numBalls; i++){
        //random x-y coordinates of a new ball:
        var x = Math.round(1.5*ballRadius + Math.random()*(w-3*ballRadius));
        var y = Math.round(1.5*ballRadius + Math.random()*(h-3*ballRadius)); //.5*ballradius minimum disrance from wall
        this.balls.push(new ball(x,y,ballRadius, speed))
      }
      //initialize the exploding balls:
      for(var i = 0; i<numExplodingBalls; i++){  //exploding balls can't be too close to the edges; that isn't fair
        var x = Math.round(10*ballRadius + Math.random()*(w-20*ballRadius));
        var y = Math.round(10*ballRadius + Math.random()*(h-20*ballRadius));
        var bal = new ball(x,y,ballRadius,speed, "e") //e for explosive
        this.balls.push(bal)
        this.explodingBalls.push(bal)
      }

      /*Not using this inefficient wall type anymore:
      /*MAKE SURE TO NOT MAKE THE WIDTHS NEGATIVE - THE wall.highestPoint, leftestPoint, etc. methods will not work if they
       *are negative. It may be a good idea to make those methods work with negative values, but it seems that would be less
       *efficient because more steps would be involved in those methods, which are called a lot. It also may be good to have
       *the highestPoint, lowestPoint, etc. methods of the four walls at the edges of the canvas only be called once instead
       *of for every ball in every update. Also make sure the balls are not already touching the walls upon initialization
       this.walls = [new wall(0,0,w,1), new wall(0,0,1,h), new wall(0,h-2,w,1), new wall(w-2,0,1,h)], //default border walls of 0px
       */

       /*USING THIS INSTEAD:*/
       this.wallThickness = 1 //each wall is 1px thick and at an edge of the screen.



      /*USER OBSTACLE: a set of pixels that the user selected to be included in the "obstacle." The user probably sees this as
       *"obstacle" as multiple obstacles, but the program treats them all as one. It doesn't care how the pixels are grouped,
       *just where they are.
       *
       *The obstacle has a radius. If a ball is closer than ball.radius + obstacle.radius, a collision will be registered */

        this.maxObstacles = 1 //1 wall per exploding ball sounds good


        this.userObstacles = [];
        this.mostRecentObstacle = function(){return this.userObstacles[this.userObstacles.length-1]} //last element in the array
        this.addNewObstacle = function(){this.userObstacles.push(new userObstacle())}

        this.removeExcessObstacles = function(){
          while(this.userObstacles.length > this.maxObstacles){this.userObstacles.shift()}
        }

        this.addPixelsToUserObstacles = function(event){
          //if(curLevel.model.userObstacles.length < 1){this.addNewObstacle()} //make a new user obstacle if none exist

          if(event.type == "mousedown"){this.addNewObstacle()}//make a new user obstacle if it was a mousedown not a mousemove

          //if(userObstacle.atMaxLength()){this.addNewObstacle()}     //make a new user obstacle if the current one has the maximum number of points

          //if(curLevel.model.mostRecentObstacle() === undefined){curLevel.model.addNewObstacle()}
          curLevel.model.mostRecentObstacle().addPixels(event)
          curLevel.model.removeExcessObstacles() //remove any excess obstaclds if there are any real-time, while pixels are being added
        }




      this.getBalls = function(){return this.balls}

      //functions to help find intersections of balls and obstacles:
      var equation = function(m,b){
        this.m = m;
        this.b = b;
        //getters and setters are probably unecessary
      }

      //arguments: point in form [x,y] and vec in form [xComponent, yComponent]
      function equationFromPointAnd2dVec(point, vec){
        var rise = vec[1]
        var run = vec[0]
        var slope = rise/run
        return equationFromPointAndSlope(point, slope)
      }

      function equationFromPointAndSlope(point, slope){
        var intercept =  point[1] - slope*point[0]
        return new equation(slope, intercept)
      }

      function intersectionOf2Equations(e1, e2){
          var x = (e2.b-e1.b)/(e1.m-e2.m)
          var y = e1.m*x+e1.b
          console.assert(Math.round(y) == Math.round(e2.m*x+e2.b))//remove this for production if we reeally need an insignificant efficiency boost -
                                                                  //just checking whether both equations give the same y value for the x value
          return [x,y]
      }
      this.ballAndObstacleCollisionStatus = function(ball,ob){
        var ballAndObSegmentCollision = {collisionHappening: false} //default value, if there's no collision just return this
        for(var r = 0, pix = ob.getPixels(), numPix = pix.length; r<numPix-1; r++){
          var wallPoint = pix[r]
          var nextWallPoint = pix[r+1]
          var segment = [wallPoint, nextWallPoint]
          ballAndObSegmentCollision = this.ballAndObstacleSegmentCollisionStatus(ball, segment)

          if(ballAndObSegmentCollision.collisionHappening){return ballAndObSegmentCollision} //if there's a collision, just pass the collision data
      }
      return ballAndObSegmentCollision //if none of the segment collisions happened, this returns the most recent segment's "collision" data, which,
                                       //like all of the other segments' "collision" data, contains a false value for collisionHappening. it's just
                                       //an arbitrary return value that has a similar format as the other return value this function gives but false
      }
      this.ballAndObstacleSegmentCollisionStatus = function(ball, segment){
        var wallPoint = segment[0]
        var nextWallPoint = segment[1]

        this.closestDistanceToObstacle = null

        var ballPoint = [ball.getX(), ball.getY()]
        var ballVec = ball.getVelocity()
        var ballTrajectoryEquation = equationFromPointAnd2dVec(ballPoint, ballVec)
        var rad = ball.getRadius()

          //compute distance between ball center and closest point on wall:
            //first find intersection of ball velocity vector and wall:
              //step 1. compute equations of lines (in slope-intercept form)
                var wallVec = [nextWallPoint[0]-wallPoint[0], nextWallPoint[1]-wallPoint[1]]
                var wallExtensionEquation = equationFromPointAnd2dVec(wallPoint, wallVec)

                var intersection = intersectionOf2Equations(ballTrajectoryEquation,wallExtensionEquation)


                var slopeOfWallNormal = -1/wallExtensionEquation.m
                var shortestLineFromBallToWall = equationFromPointAndSlope(ballPoint, slopeOfWallNormal)
                var collisionPoint = intersectionOf2Equations(shortestLineFromBallToWall, wallExtensionEquation)


                var wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]

                //not using this:
                /*Now that the intersection has been found, find the angle between the velocity and the wall*/
                /*Make sure the SIGNS OF ALL THESE ANGLES ARE CORRECT:*/
                /*
                angleBetweenVelocityAndXAxis = -Math.atan2(ballTrajectoryEquation.rise, ballTrajectoryEquation.run)
                angleBetweenWallAndYAxis = Math.PI/2 - Math.atan2(wallExtensionEquation.rise, wallExtensionEquation.run)
                angleBetweenWallAndXAxis = -Math.atan2(wallExtensionEquation.rise, wallExtensionEquation.run)
                angleBetweenVelocityAndWall = angleBetweenVelocityAndXAxis-angleBetweenWallAndXAxis//Math.PI/2 - angleBetweenVelocityAndXAxis - angleBetweenWallAndYAxis
                //angleBetweenWallAndXAxis = Math.PI/2 - angleBetweenWallAndYAxis
                ballToIntersectionDistance = distanceBetween(ballPoint, intersection)


                //console.log(angleBetweenVelocityAndWall*57.3)
                 //See diagrams //NOTE: ADD DIAGRAMS
                 distanceBetweenCollisionAndIntersection = ballToIntersectionDistance * Math.sin(Math.PI/2 + angleBetweenVelocityAndWall)

                 HoriDistanceBetweenCollisionAndIntersection = Math.sqrt(distanceBetweenCollisionAndIntersection*distanceBetweenCollisionAndIntersection /
                                                                        (wallExtensionEquation.m*wallExtensionEquation.m + 1))
                 //slope (m) = vertical-distance/horizontal-distance
                 VertDistanceBetweenCollisionAndIntersection = /*-/ABS?*/ /*wallExtensionEquation.m*HoriDistanceBetweenCollisionAndIntersection

                 collisionPoint = [intersection[0]-HoriDistanceBetweenCollisionAndIntersection, intersection[1]-VertDistanceBetweenCollisionAndIntersection]*/


                //this is being used though:
                //Consider the following scenario: the collisionPoint is not actually the closest point on the wall's extension. This happens when the ball collides with
                // an endpoint of the wall. For these cases, set collisionPoint to the wall's endpoint:
                var radPad = 0
                if(distanceBetween(ballPoint, wallPoint) <= rad+radPad) {
                  collisionPoint = wallPoint;
                  //treat the collision point as a small circle and collide off the tangent line. luckily, the vector normal to the tangent line
                  //has the same direction as that between the ballPoint and wallPoint(the collision point). it's magnitute doesn't matter because
                  //it will be normalized!
                  wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]
                }
                if(distanceBetween(ballPoint, nextWallPoint) <= rad+radPad) {
                  collisionPoint = nextWallPoint;
                  //get the new normal
                  wallNormalVector_UnNormalized = [ballPoint[0]-collisionPoint[0], ballPoint[1]-collisionPoint[1]]
                }
                //Check whether the collision point is actually within the wall and not just in its extension
                var obColPad = 0//collision padding - how far away a ball needs to be from an obstacle for it to collide
                var collisionIsWithinSegment = (collisionPoint[0] >= Math.min(wallPoint[0], nextWallPoint[0])-obColPad) &&
                                           (collisionPoint[0] <= Math.max(wallPoint[0], nextWallPoint[0])+obColPad) &&
                                           (collisionPoint[1] >= Math.min(wallPoint[1], nextWallPoint[1])-obColPad) &&
                                           (collisionPoint[1] <= Math.max(wallPoint[1], nextWallPoint[1])+obColPad)


                //The ball can be touching the wall even if it doesn't intersect, so we need to find the distance to the closest point on the wall:
                //The line between this and the ball is always pi/2 radians from the ball, so we can use the sin:

                var ballToWallClosestDistance = distanceBetween(collisionPoint, ballPoint)


                var ballWithinLineRange = false
                if(Math.abs(ballToWallClosestDistance) < rad){
                  ballWithinLineRange = true
                }

                //view.showPoint(collisionPoint)
                //console.log(angleBetweenVelocityAndWall*57.3)
                //alert(ballToWallClosestDistance + ", " + collisionIsWithinSegmentPlusBallRadius + ", " + ballWithinLineRange + ", " + collisionPoint)
                //if(!collisionIsWithinSegment && ballWithinLineRange){console.log(collisionPoint)}

                if(collisionIsWithinSegment && ballWithinLineRange){
                  //view.showPoint(collisionPoint)
                  return {collisionHappening: true, wallVector: wallVec, ballVector: ballVec, wallNormal: wallNormalVector_UnNormalized}
                } else {
                  return {collisionHappening: false, wallVector: wallVec, ballVector: ballVec, wallNormal: wallNormalVector_UnNormalized}
                }


      }

      this.update = function(newTime){
       if(!this.frozen){ //don't update if it's frozen
        var timestepDuration = newTime - this.currentTime
        this.currentTime = newTime



        //Checks for collision with the four walls surrounding the game, NOT user-defined obstacles/walls
        this.executeWallCollisions = function(){

        for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){

          var ball = this.balls[i];
          var ballPoint = [ball.getX(), ball.getY()]

          var collisionRadius = ball.getRadius() + this.wallThickness //greatest distance that can trigger a collision

          var collisionLeftWall = ballPoint[0]-collisionRadius <= 0
          var collisionRightWall = ballPoint[0]+collisionRadius >= w
          var collisionTopWall = ballPoint[1]-collisionRadius <= 0
          var collisionBottomWall = ballPoint[1]+collisionRadius >= h

          var vel = ball.getVelocity()
          if(collisionLeftWall || collisionRightWall){
            //flip motion in x-direction
            ball.setVelocity([-vel[0], vel[1]])
          } //IF MULTIPLE COLLISIONS IN ONE UPDATE ARE A PROBLEM, PUT AN ELSE HERE
          if(collisionTopWall || collisionBottomWall) {
            //flip motion in y-direction
            ball.setVelocity([vel[0], -vel[1]])
          }

          /*NOT USING THIS INEFFICIENT WALL-COLLISION DETECTION ALGORITHM:
          for(var k = 0, numWalls = this.walls.length; k < numWalls; k++){

            var wall = this.walls[k]


            var wallX = wall.getX()
            var wallY = wall.getY()
            var wallL = wall.getL()
            var wallW = wall.getW()


            var rad = ball.getRadius()

            //var bh = ball.highestPoint()
            //var bl = ball.lowestPoint()
            //var be = ball.leftestPoint()
            //var br = ball.rightestPoint()

            var wh = wall.highestSide()
            var wl = wall.lowestSide()
            var we = wall.leftestSide()
            var wr = wall.rightestSide()


            //NOTE: you can increase the padding for better performance withhigher velocities
            var padding = 0
            function oneDimDistance(a,b) {return Math.abs(a-b)} //his is just encapsulation of a simple but soon-to-be frequently used procedure

            var closestSideOfWallVertically = (oneDimDistance(ballPoint[1], wh) < oneDimDistance(ballPoint[1], wl)) ? wh : wl

            var closestSideOfWallHorizontally = (oneDimDistance(ballPoint[0], we) < oneDimDistance(ballPoint[0], wr)) ? we : wr

            var closestVertDistance = oneDimDistance(ballPoint[1], closestSideOfWallVertically)
            var closestHoriDistance = oneDimDistance(ballPoint[0], closestSideOfWallHorizontally)

            if(closestVertDistance <= rad+padding || closestHoriDistance <= rad+padding){
              ball.collide("wall");
              //multiply the velocity by -1 on appropriate axis. but how do we find the appropriate axis?:
              //by looking for the side of the wall the ball is closest to

                var closestWall = "both" //default value. this is usefeul when the ball collides with both at the same time (which is very rare)

                if(closestVertDistance < closestHoriDistance){
                  closestWall = "vert"
                } else if(closestHoriDistance < closestVertDistance){
                  closestWall = "hori"
                }

                //now, find and set the ball's velocity
                var vel = ball.getVelocity()
                switch(closestWall){
                case "vert":
                  ball.setVelocity([vel[0], -vel[1]])
                  break
                case "hori":
                  ball.setVelocity([-vel[0], vel[1]])
                  break
                case "both":
                  ball.setVelocity([-vel[0], -vel[1]])
                  break

                }

              //move the ball one increment after setting its velocity (or leaving it):
            }
          }*/
          }
        }


        this.executeObstacleCollisions = function(){
          //iterate through all the balls and pixels (except last pixel because there will be no line drawn from it):
          for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){
            var ball = this.balls[i]
            var rad = ball.getRadius()
            var ballPoint = [ball.getX(), ball.getY()]
            var ballVec = ball.getVelocity()
            var ballTrajectoryEquation = equationFromPointAnd2dVec(ballPoint, ballVec)

            for(var o = 0, obs = this.userObstacles, numObs = obs.length; o<numObs; o++){
              var ob = obs[o]
              //uncomment? for(var j = 0, pix = ob.getPixels(), numPix = pix.length; j<numPix-1; j++){
                //compute distance between ball center and closest point on wall:
                  //first find intersection of ball velocity vector and wall:
                    //step 1. compute equations of lines (in slope-intercept form)

                    //uncomment these? or delete, we'll see
                      /*wallPoint = pix[j]
                      nextWallPoint = pix[j+1]
                      wallVec = [nextWallPoint[0]-wallPoint[0], nextWallPoint[1]-wallPoint[1]]
                      wallExtensionEquation = equationFromPointAnd2dVec(wallPoint, wallVec)

                      intersection = intersectionOf2Equations(ballTrajectoryEquation,wallExtensionEquation)
    */
                      var collisionData = this.ballAndObstacleCollisionStatus(ball,ob)

                      if(collisionData.collisionHappening){
                        //there's a collision
                        ball.collide("userObstacle")

                        //the wallNormalVector_UnNormalized vector's magnitude will need to be calculated
                        var wallNormalVector_UnNormalized = collisionData.wallNormal
                        var wallNormalVectorUnNormalizedMagnitude = Math.sqrt(wallNormalVector_UnNormalized[0]*wallNormalVector_UnNormalized[0] + wallNormalVector_UnNormalized[1]*wallNormalVector_UnNormalized[1])
                        var ballToWallClosestDistance = wallNormalVectorUnNormalizedMagnitude

                        //sometimes, the balls can end up in the walls. The user should be allowed to draw walls through balls,
                        //and the balls can occasionally find their way into walls. In these cases, balls should just pass through
                        //and their velocities should not be changed.
                        //This function will still try to chenge the balls' velocities and treat them as if they were normal ball
                        //that aren't already within obstacles. But the balls will block this change if they are within an obstacle
                        var ballIsInsideWall = Math.abs(ballToWallClosestDistance) + 5 < rad //5px are given as leeway
                        if(!ballIsInsideWall){
                        //perform collision bounceback:
                        //According to https://www.3dkingdoms.com/weekly/weekly.php?a=2, resulting velocity vector = -2*(V dot N)*N + V, where V is the velocity and N is the normalized normal vector
                        var wallNormalVector_Normalized = [wallNormalVector_UnNormalized[0]/wallNormalVectorUnNormalizedMagnitude, wallNormalVector_UnNormalized[1]/wallNormalVectorUnNormalizedMagnitude]
                        var velocityVector = collisionData.ballVector
                        var VelocityAndWallNormalNormalizedDotProduct = velocityVector[0]*wallNormalVector_Normalized[0] + velocityVector[1]*wallNormalVector_Normalized[1]
                        var negativeTwoTimesDotP = -2*VelocityAndWallNormalNormalizedDotProduct
                        var resultingVelocity = [wallNormalVector_Normalized[0]*negativeTwoTimesDotP+velocityVector[0], wallNormalVector_Normalized[1]*negativeTwoTimesDotP+velocityVector[1]]

                        ball.setVelocity(resultingVelocity)
                        console.log(resultingVelocity)
                        //  this.color = "red"//"#"+((1<<24)*Math.random()|0).toString(16)
    /*not using:
                          angleBetweenResultingVelocityAndXAxis = angleBetweenWallAndXAxis - angleBetweenVelocityAndWall
                          alert(angleBetweenWallAndXAxis + "," + angleBetweenVelocityAndWall)
                          console.log(angleBetweenWallAndXAxis*57.3)
                          //now, we know the angle of the velocity. we just need the magnitute:
                          velMagnitude = Math.sqrt(ballVec[0]*ballVec[0] + ballVec[1]*ballVec[1])
                          resultingVelXComponent = velMagnitude*Math.cos(angleBetweenResultingVelocityAndXAxis)
                          resultingVelYComponent = velMagnitude*Math.sin(angleBetweenResultingVelocityAndXAxis)
                          ball.setVelocity([resultingVelXComponent, resultingVelYComponent])*/
                      }
                      else(console.log(ballToWallClosestDistance, rad))
                    } else{ball.color = ballColor}

                      }
                    }
                }

        this.executeWallCollisions()
        this.executeObstacleCollisions()
        //move the balls
        for(var i = 0, numBalls = this.balls.length; i < numBalls; i++){
          this.balls[i].move(timestepDuration)
        }

      }
     }

     this.checkDefusalGuess = function(clickPoint){
       //alert("Checkin'")
        var clickIsInABall = false
        var balls = curLevel.model.getBalls()
        for(var k = 0, numBalls = balls.length; k < numBalls; k++){
          if(distanceBetween(clickPoint, [balls[k].getX(), balls[k].getY()] ) <= balls[k].getRadius()){
            var guessedBall = balls[k]
            var clickIsInABall = true
            console.log(guessedBall.getX(), guessedBall.getY())
            if(guessedBall.isBallExplosive() && !curLevel.controller.ballWasAlreadyGuessed(guessedBall)){curLevel.controller.addGuessedBall(guessedBall); return true}
          }
        }
        //after iterating through all of them and none of them beign correct guesses (because correct guesses would have resulted in return true)
        if(clickIsInABall){
          return false
        } else {return "notABall"}
      }
    }


    //constructor for balls: (x and y are initial position)
    function ball(x, y, radius, speed, isExplosive) {
      this.collisionsEnabled = true //collisions allowed
      this.obstacleSegmentsIAmInsideOf = []
      //segment is of form [segmentStart, segmentEnd]
      this.isWithinObstacleSegment = function(segment){
        //if it's colliding, it's "inside" for all practical purposes -
        //if it's colliding during obstacle creation, it should pass through the obstacle segment it's inside of
        return curLevel.model.ballAndObstacleSegmentCollisionStatus(this,segment).collisionHappening
      }

      this.respondToObstacleSegmentCreation = function(segment) {
        //Only say the ball is inside an obstacle if it is inside when the obstacle is created! Otherwise, there's no reason for the ball to be inside:
        if(this.isWithinObstacleSegment(segment) && !this.obstacleSegmentsIAmInsideOf.includes(segment)){this.obstacleSegmentsIAmInsideOf.push(segment)}
      }
      this.color = ballColor
      this.getColor = function() {return this.color}
      this.setColor = function(col) {this.color = col}
      this.explosive = (isExplosive == "e")
      this.isBallExplosive = function(){return this.explosive}
      this.collide = function(collisionType){

        if(!this.collisionsEnabled){

        } else if(collisionType == "wall" && this.explosive){
          curLevel.defusalMode(); //COMMENT THIS TO DISABLE DEFUSAL MODE
        } else if(collisionType == "userObstacle"){

        }
        console.log(this.collisionsEnabled)
                                     //obstaclesSegmentsIAmInsideOf must be empty so it doesn't register a collision when it's inside
        if(this.collisionsEnabled && this. obstacleSegmentsIAmInsideOf.length < 1){ //it seems unecessary to have this type of if statement with
                                    //collisionsEnabled twice but I couldn't exit the function in the previous if statement to prevent
                                    //this line from happening: (returning in that earlier conditional didn't actually exit the overall function)

          this.onCollide(collisionType);
        }
      }
      this.onCollide = function(collisionType){
        //setTimeout(function(){b.collisionsEnabled = false}, 10)
        //setTimeout(function(){b.collisionsEnabled = true}, 100)
        //this.color = "#FF0000"
        if(collisionType == "wall") {
          this.wallCollider.collide(this.x, this.y)
        } else if (collisionType == "userObstacle") {
          this.userObstacleCollider.collide(this.x, this.y)
        }
      }
      this.wallCollider = (this.explosive) ? new wallExplodeAnimation() : new standardWallCollideAnimation();
      this.userObstacleCollider = new userObstacleCollisionAnimation()
      this.radius = radius
      this.getRadius = function(){return this.radius}
      //all balls must have the same speed but random direction: therefore their:
      //x velocity = their speed*cos(random angle), y velocity: speed*sin(same angle)

      var randomAngle = Math.random()*2*Math.PI
      this.velocity = [speed*Math.cos(randomAngle), speed*Math.sin(randomAngle)]
      this.x = x//Math.random()*view.gameWidth
      //this.x_prev = null, //previous position is important to calculate angle of movement
      this.y = y//Math.random()* view.gameHeight
      //this.y_prev = null
      this.getX = function(){return this.x};
      this.getY = function(){return this.y};
      //this.getPrevX = function(){return this.x_prev};
      //this.getPrevY = function(){return this.y_prev};

      this.setX = function(new_x){
        //this.x_prev = this.x
        this.x = new_x
      }
      this.setY = function(new_y){
        //y_prev = this.y
        this.y = new_y
      }


      this.getVelocity = function(){return this.velocity};

      this.setVelocity = function(v){
          //don't allow setting velocity if ball is inside an obstacle.
          //let the velocity stay the same until it exits the obstacle. it should only be in an obstacle if the obstacle was created over the ball
          for(var p=0; p<this.obstacleSegmentsIAmInsideOf.length; p++){
            var segment = this.obstacleSegmentsIAmInsideOf[p]
            //if it's no longer within the obstacle:
            if(!this.isWithinObstacleSegment(segment)){
              //remove the obstacle from the array:
              var idx = this.obstacleSegmentsIAmInsideOf.indexOf(segment)
              this.obstacleSegmentsIAmInsideOf.splice(idx,1)
            }
          }

          //now, set the velocity iff it's not within any obstacles (it should smoothly pass through obsacles it's already within, and it should only be
          //within them if they were created on top of it), and if collisions are enabled:\
          if(this.obstacleSegmentsIAmInsideOf.length < 1 && this.collisionsEnabled){this.velocity = v; console.log("setting velocity")} else{console.log("setting velocity blocked" + this.obstacleSegmentsIAmInsideOf.length)}

      }

      this.highestRow = function(){return this.y - this.radius}
      this.lowestRow = function(){return this.y + this.radius}
      this.leftestColumn = function() {return this.x - this.radius}
      this.rightestColumn = function() {return this.x + this.radius}

      //move the ball one increment accorsing to its current velocity and position:
      this.move = function(timestepDuration){
        var td = timestepDuration
        //account for strange timestepDuration values like 0 or very high values:
        if(td == 0 | td > 100){
          td = 30
        }
        var stuckInWall = this.x-this.radius < 0 || this.x+radius > w || this.y-this.radius < 0 || this.y-this.radius > h
        /*update x-axis position using differential equation dx/dt = v_x*/
        var dx = this.getVelocity()[0] * td
        var newX = this.getX() + dx;
        this.setX(newX)
        var dy = this.getVelocity()[1] * td
        //console.log(timestepDuration)
        var newY = this.getY() + dy
        this.setY(newY);
        //remember, take some of these lines out if you wanna really maximize efficiency
        //console.assert((this.getX() == new_x) && (this.getY() == new_y))
        //if(Math.abs(this.getVelocity()[0]) > 2 || Math.abs(this.getVelocity()[1]) > 2){console.log("slow down")}
      }
    }
    function standardWallCollideAnimation(){
        this.collide = function(x,y){ };
    }

    /*TODO: make an animation class and subclass these. I don't know enough about JS classes to do that easily*/
    function wallExplodeAnimation(){
        var img = "explosion.png"
        var duration = 2000
        this.collide = function(x,y) {curLevel.view.showImgAtFor(img, x, y, duration)}
    }

    function userObstacleCollisionAnimation(){
        this.animationCoolDownTime = 100;
        var img = "obstacoll.png"
        var duration = 200
        this.collide = function(x,y) {
          if(!this.animationAlreadyDisplayed){
            //don't allow for simultaneous animations for the same userObstacleCollisionAnimation object
            this.animationAlreadyDisplayed = true
            curLevel.view.showImgAtFor(img, x, y, duration, this)
          }
        }
        this.respondToImageBeingCleared = function(){this.animationAlreadyDisplayed=false}
    }

    function wall(x,y/*top left x and y*/, w, l/*length and width*/){

      this.x = x;
      this.y = y;
      this.w = w;
      this.l = l;

      this.getX = function(){return x}
      this.getY = function(){return y}
      this.getL = function(){return l}
      this.getW = function(){return w}

      this.highestSide = function(){return y}
      this.lowestSide = function(){return y+l}
      this.leftestSide = function(){return x}
      this.rightestSide = function(){return x+w}
    }

    function userObstacle() {
      this.pixels = new Array(),
      this.maxPixels = par.max_user_defined_obstacle_segments+1,
      this.radius = 4,
      this.minDistanceBetweenPixels = par.min_distance_between_obstacle_pixels,
      this.maxDistanceBetweenPixels = par.max_distance_between_obstacle_pixels,
      //minDistanceToCallItSamePixelSquared: 300,
      this.pixelLimitExceeded = false,

      this.addPixels = function(event){
        var pos = getPixelPositionRelativeToObject([event.pageX, event.pageY], curLevel.view.can)
        //if there are no existing pixels/points, just add it without the for loop
        var numPix = this.pixels.length;
        if(numPix == 0){
          this.pixels.push(pos)
          return; //break it so the function doesn't try to add the value again
        }
        var validPosition = true
        //add them if they're far enough from the previous pixels.
        for(var l=0; l<numPix; l++){
          var dist = distanceBetween(pos, this.pixels[l])

          if(dist < this.minDistanceBetweenPixels || dist > this.maxDistanceBetweenPixels ||
            /*the slope also cannot be perfectly vertical/undefined! nor perfectly horizontal!: */
            this.pixels[l][0] == pos[0] || this.pixels[l][1] == pos[1]){
            //console.log(pixels[l][0], event.pageX)
            validPosition = false;
            break;
          }
        }

        if(validPosition){
            this.pixels.push(pos)
            //alert the balls of the new user obstacle, now that it has changed (it doesn't matter that excess wall's haven't been removed yet -
            //they are being alerted so they don't collide if inside the new segment and existing obstacle if they're already inside. if they don't
            //collide with the old segment either that's fine)
            var balls = curLevel.model.getBalls()
            for(var q = 0, numOfBalls = balls.length; q < numOfBalls; q++){
              var numPix = this.pixels.length
              lastPixel = this.pixels[numPix - 1]
              secondToLastPixel = (numPix > 1) ? this.pixels[numPix -2] : this.pixels[numPix - 1]
              balls[q].respondToObstacleSegmentCreation([lastPixel, secondToLastPixel])
            }
          }
        while(this.pixels.length > this.maxPixels){
            //console.log(this.pixels)
            this.pixels.shift() //get rid of the first element
            //console.log(this.pixels)
        }
      }

    /*
        if(([event.pageX, event.pageY]){} //if(this.pixels.length == this.maxPixels){
          this.pixels.push([event.pageX, event.pageY])
        } else if (this.pixels.length >= this.maxPixels) {
          //if this is the first time exceeding the pixel limit:
          if(!this.pixelLimitExceeded){
            view.message("You can't use too much wall... that would make it easy")
            //set it to true so this message only displays once:
            this.pixelLimitExceeded = true;
          }


        }
      },*/

      this.getPixels = function(){return this.pixels}
      this.getRadius = function(){return this.radius}
      //this.atMaxLength() = function(){return this.pixels.length == this.maxPointsInWall}
    }

    function view() {
      //get canvas, context
      this.can = null
      this.ctx = null
      this.highlightingSelectedBalls = false
      this.pointsToShow = new Array(),
      this.showPoint = function(pt) {this.pointsToShow.push(pt)}

      this.initialized = false
      this.init = function(){
        this.can = document.getElementById('mainCanvas')
        this.ctx = this.can.getContext("2d")
        this.initialized = true
      }

      this.showInitialFrame = function(model, duration){
        //just call view's update function once. However, the exploding balls' colors must be changed. TODO: add a nice countdown animation on top, on the overlay canvas maybe

        //change the exploding balls' colors:
        for(var j = 0, balls = model.getBalls(), numBalls = balls.length; j < numBalls; j++){
          var ball = balls[j];
            if(ball.isBallExplosive()){

            ball.setColor("orange")
            setTimeout(function(){curLevel.resetAllBalldesigns(curLevel.model)},duration)
          }

        }
        this.update(model)
      }

      this.update = function(model){
        if(this.initialized){
          console.log(model.getBalls())
          //var can = this.can;
          var ctx = this.ctx; //easier to work with than having to write this.ctx each time
          //clear the context:
          ctx.clearRect(0,0, w, h);
          var balls = model.getBalls();

          //Iterate through the balls and display their current attributes:
          for(var j = 0, numBalls = balls.length; j < numBalls; j++){
            var ball = balls[j];
            var color = ball.getColor()
            ctx.beginPath();
            ctx.fillStyle = color
            ctx.arc(ball.getX(), ball.getY(), ball.getRadius(), 0, 2*Math.PI);
            ctx.fill();
      /*    uncomment for displaying an image for a ball
              var imgElement = new Image();
              imgElement.src = "ball.png";
              ctx.drawImage(imgElement, ball.getX(), ball.getY());
      */
            ctx.closePath();
          }

          //not using commented parts anymore:
          //for(var j = 0, numWalls = 4; j < numWalls; j++){
            //var wall = model.walls[j];
            var color = "green"
            ctx.beginPath();
            ctx.fillStyle = color
            //ctx.rect(wall.getX(), wall.getY(), wall.getW(), wall.getL())
            var wallThickness = curLevel.model.wallThickness
            ctx.rect(0,0,wallThickness, h)
            ctx.rect(0,0,w,wallThickness)
            ctx.rect(w-wallThickness,0,wallThickness,h)
            ctx.rect(0,h-wallThickness,w,wallThickness)
            ctx.fill();
            ctx.closePath();
          //}

          //display the points/pixels in the user-defined wall as circles and draw line segments between them (except for before the first and after the last pixel)
          for(var j = 0, obs = model.userObstacles, numObs = obs.length; j<numObs; j++){
            var ob = obs[j]
            for(var o = 0, pix = ob.getPixels(), numPix = pix.length, rad = ob.getRadius(); o<numPix; o++){
              //get x and y values of the pixel
              var x = pix[o][0]
              var y = pix[o][1]

              var color = "maroon"
              //draw circles of radius rad around each pixel
              ctx.beginPath()
              ctx.fillStyle = color
              ctx.arc(x, y, rad, 0, 2*Math.PI)
              ctx.fill()

              //then draw a line from the pixel to the next pixel (if the next pixel exists)
              if(o < numPix-1){
                ctx.fillStyle = color
                ctx.moveTo(pix[o][0], pix[o][1])
                ctx.lineTo(pix[o+1][0], pix[o+1][1])
                ctx.stroke();
              }

              ctx.closePath()

            }
          }

          //show the points:
          for(var j = 0, pix = this.pointsToShow, numPix = pix.length; j<numPix; j++){
            var x = pix[j][0]
            var y = pix[j][1]

            var color = "black"
            //draw circles of radius rad around each pixel
            ctx.beginPath()
            ctx.fillStyle = color
            ctx.arc(x, y, 3, 0, 2*Math.PI)
            ctx.fill()
            ctx.closePath();
          }
        }
      },

      //img is a link to the image file
      this.showImgAtFor = function(image, x, y, duration, objectToNotifyWhenDoneDisplaying){
        var ocan = document.getElementById("overlay")
        var octx = ocan.getContext('2d')
        var imgElement = new Image();
        imgElement.src = image;

        var width = null, height = null;
        imgElement.onload = function(){
          width = imgElement.width, height = imgElement.height;
          octx.drawImage(imgElement, x-width/2, y-height/2)
        }

        //clear it after the duration's up:
        setTimeout(function(){
          octx.clearRect(x-width/2,y-height/2,width, height)
          if(objectToNotifyWhenDoneDisplaying !== undefined){
            objectToNotifyWhenDoneDisplaying.respondToImageBeingCleared()
          }

        }, duration)
        //imgElement.style.position = "absolute"
        //imgElement.style.top = "300"
        //document.body.appendChild(imgElement);

      }

      //display a message to the player
      this.message = function(msg){alert(msg)}

      this.displayDefusalMessage = function(defusalTimeLimit){
        var ocan = document.getElementById("overlay")
        var octx = ocan.getContext('2d')
        octx.textAlign = "center"
        octx.font = "30px Helvetica"
        octx.strokeText("Defusal Mode", w/2, h/3)
        octx.font = ("12px Arial")
        octx.fillText("You have " + defusalTimeLimit/1000 + " seconds to defuse the exploding balls. but don't choose the wrong ball!", w/2, h/2)
      },

      this.highlightSelectedBalls = function(event){
        var can = document.getElementById('selectionCanvas')
        var ctx = can.getContext('2d')
        //iterate through the balls to check whether the mouth is within them:
        var balls = curLevel.model.getBalls()
        for(var n = 0, numBalls = balls.length; n < numBalls; n++){
          var ball = balls[n]
          var selectionRadiusAddOn = 1
          var totalRadius = ball.getRadius()+selectionRadiusAddOn

          if(distanceBetween([event.pageX,event.pageY], [ball.getX(), ball.getY()]) < ball.getRadius()){
            //display a border around the ball
            ctx.beginPath()
            ctx.strokeStyle = "red"
            ctx.arc(ball.getX(), ball.getY(), totalRadius, 0, 2*Math.PI)
            ctx.stroke()
            ctx.closePath();

          } else {
            //clear the rect aronud the ball
            var totalDiameter = totalRadius * 2
            ctx.beginPath()
            ctx.clearRect(ball.getX()-totalRadius-1, ball.getY()-totalRadius-1, totalDiameter+2, totalDiameter+2)
            ctx.stroke()
            ctx.closePath()
          }

        }


      },
      //clears all displays:
      this.clearView = function(){
        var canvii = document.getElementsByTagName("CANVAS")
        var ctxes = [];
        for(var canCounter = 0; canCounter < canvii.length; canCounter++){ctxes.push(canvii[canCounter].getContext('2d'))}
        for(var conCounter = 0; conCounter < ctxes.length; conCounter++){
          var ctx = ctxes[conCounter]
          var canWidth = canvii[conCounter].width
          var canHeight = canvii[conCounter].height
          ctx.clearRect(0,0,canWidth,canHeight);
        }
      },
      //timer displaying:
      this.timer = {
        hidden: false, //toggle whether it's displayed
        hide: function() {this.hidden = true},
        color: "red",
        getColor: function(){return this.color},
        fontSize:12,
        x: w/2, // x positioning
        y: h/22,
        countdown: true, //default is countdown-mode, not countup-mode
        ctdwnTime: 0,
        setCountdownTime: function(t){this.ctdwnTime = t},
        startTime: 0, //0 means it hasn't been set
        curTime: 60,
        updateCurTime: function(){
          //startDate must be set already for this to work properly.
          this.curTime = this.ctdwnTime*1000 - (new Date().valueOf() - this.startTime)
          this.curTimeInSeconds = Math.round(this.curTime % 60000/1000)
              //reset any -1 values which sometimes happen right after timer runs out to 0, just to look less weird for the user
              if(this.curTimeInSeconds == 0){
                //display it first because the curLevel.timeHasRunOut() will end the game before displaying the timer
                curLevel.view.timer.displayTimer();
                setTimeout(curLevel.timeHasRunOut, 150)

              }

        },
        reset : function(countdownTime, color, countdown) {
          this.setCountdownTime(countdownTime);
          this.startTime = new Date().valueOf(); //0
          this.color = color
          this.updateCurTime()
        },


        displayTimer : function(){
          //draw timer:
          var octx = document.getElementById("overlay").getContext("2d")
          if(this.hidden){
            return null //exit the function if it's hidden, before the recursive call
          }

            octx.clearRect(this.x-this.fontSize,this.y-this.fontSize, this.fontSize*2, this.fontSize*2)
            octx.font = this.fontSize + "px Arial"
            //time = Math.round((this.curTime % 60000)/1000)
            var time = this.curTimeInSeconds == null ? 0:this.curTimeInSeconds
            octx.fillStyle = this.getColor()
            octx.textAlign = "center"
            octx.fillText(time, this.x, this.y) //NOTE: assuming time counter should always be under a minute
            setTimeout(function(){curLevel.view.timer.updateCurTime();curLevel.view.timer.displayTimer();}, 1000) //recursive call
            console.log(time)
          }

        }




    }

    function controller(model, view,levelDuration){

      this.gameOver = false
      this.defusalModeOn = false
      this.setDefusalModeOn = function(){this.defusalModeOn = true;}
      this.setDefusalModeOff = function(){this.defusalModeOn = false;}
      this.isGameOver = function(){return this.gameOver} //overdoing it on the getters, setters, and LoD? maybe
      this.beginGame = function(){
        curLevel.view.init();
        this.loadCanvas();

        var initialFrameDuration = 1300 //ms
        curLevel.view.showInitialFrame(model,initialFrameDuration) //show the frame where the exploding balls look different

        //then start the first update
        this.getWallsFromUser(); //this adds an Event Listener
        setTimeout(function(){
          curLevel.view.timer.reset(levelDuration/1000, "green") //violation of LoD but I think it's ok
          curLevel.view.timer.displayTimer()// FIGURE OUT WHY THIS METHOD (OR MAYBE THE RESET?) MAKES IT LAGGY
          alert('beginGame being called')
          updateGame(0, this.model); //beginning time is 0
        }, initialFrameDuration)
        }

      this.ballHitBall = function(){console.log("Game Over")},

      this.loadCanvas = function(){this.can = document.getElementById("mainCanvas"); this.ctx = this.can.getContext("2d")},

      this.getWallsFromUser = function(){
        //first, add the event listener for mouseclicks
        document.addEventListener("mousedown", this.findWallDrawingPath);
      },

      this.findWallDrawingPath = function(event){
        //first, collect the first pixel:
        model.addPixelsToUserObstacles(event)

        document.addEventListener("mousemove", model.addPixelsToUserObstacles);
        //get rid of the mousemove listener when the mouse is released:
        document.addEventListener("mouseup", function(){document.removeEventListener("mousemove", model.addPixelsToUserObstacles); model.removeExcessObstacles()})

      }

      this.defusalMode = function(){
        //only start defusalMode if it's not on already - this prevents it being triggered multiple times by collisions:
        if(!curLevel.controller.defusalModeOn){
          curLevel.controller.setDefusalModeOn()
          var defusalTimeLimit = 10000
          curLevel.view.displayDefusalMessage(defusalTimeLimit)
          //remove the wall drawing listeners
          document.removeEventListener("mousedown", this.findWallDrawingPath)
          document.removeEventListener("mousemove", model.addPixelsToUserObstacles)

          //listen for new guesses:
          document.addEventListener("mousemove", curLevel.view.highlightSelectedBalls)
          document.addEventListener("mousedown", this.registerDefusalGuess)

          //start the timer
          view.timer.reset(defusalTimeLimit/1000, "red", true)
          curLevel.view.timer.displayTimer()



          /*setTimeout(function(){
            if(curLevel.controller.defusalModeOn){ //if the level hasn't been changed yet, the game's over after the timer's up //violation of LoD, maybe fix
              curLevel.controller.endGame()
            }},
          defusalTimeLimit)*/
        }

      }

      this.endDefusalMode = function(){
        document.removeEventListener("mousemove", curLevel.view.highlightSelectedBalls)
        document.removeEventListener("mousedown", this.registerDefusalGuess)
        curLevel.view.clearView()
      }

      this.guessesRemaining = model.numExplodingBalls()
      //alert(guessesRemaining)
      this.correctGuesses = 0
      this.incorrectGuesses = 0
      this.registerDefusalGuess = function(event){
        if(curLevel.controller.guessesRemaining > 0){
          var result = model.checkDefusalGuess([event.pageX, event.pageY])
          switch(result){
            case true: //correct guess
              curLevel.controller.correctGuesses++ //this looks like really bad OOP style but keep in mind it's happening within curLevel.controller
              curLevel.controller.guessesRemaining--
              curLevel.view.showImgAtFor("correct.png", event.pageX, event.pageY, 120)
              if(curLevel.controller.guessesRemaining == 0 && curLevel.controller.incorrectGuesses == 0){curLevel.controller.endGame("defusalModeSuccess")}
              break;
            case false:
              curLevel.controller.incorrectGuesses++
              curLevel.controller.guessesRemaining-- //-- instead of set to 0 because then we can collect data about how many the got right/wrong
              curLevel.controller.endGame("incorrectGuess")
              return null
              break;
            case "notABall":
              break;

          }

        } else { //if there are no guesses remaining:
          alert("no more guesses remaining")
          //remove the guessing event listeners
          document.removeEventListener("mousedown", this.registerDefusalGuess)
          document.removeEventListener("mousemove", curLevel.view.highlightSelectedBalls)

        }

      }

      var guessedBalls = [];
      this.ballWasAlreadyGuessed = function(ball){return guessedBalls.includes(ball)}
      this.addGuessedBall = function(ball){guessedBalls.push(ball)}

      this.endGame = function(howGameEnded){
        curLevel.view.timer.hide()
        switch(howGameEnded){
          case "defusalModeNeverHappened":
            alert("Level Passed!");
            break;
          case "defusalModeTimeRanOut":
            alert("Out of time...restarting at level 0");
            //maybe we can have it restart at the level before?
            break;
          case "incorrectGuess":
            alert("Incorrect guess...starting again at level 0")
            //maybe we can have it restart at the level before?
            break;
          case "defusalModeSuccess":
            alert("Level Passed!");
            break;
        }
        curLevel.controller.endDefusalMode()
        curLevel = levelZero()
        //curLevel.beginGame()
      }



    }

    //takes a model as an argument. It may be good to make view and controller as arguments, but I don't foresee a realy use in doing so
    //edit: also takes levelDuration now, in ms.
    function level(model, view, controller, levelDuration) {
      this.model = model
      this.view = view
      this.controller = controller,
      this.gameOver = function(){return this.controller.isGameOver()}
      this.update = function(currentTime){
         console.log('updating')
         this.model.update(currentTime)
         this.view.update(this.model)
      }
      this.beginGame = function(){
        this.controller.beginGame()
      }

      //begins defusal mode:
      this.defusalMode = function(){
        this.model.freeze()
        this.controller.defusalMode()
      }
      this.isDefusalModeOn = function(){return this.controller.defusalModeOn}
      this.timeHasRunOut = function(){
        if(curLevel.isDefusalModeOn()){curLevel.controller.endGame("defusalModeTimeRanOut")}else{curLevel.controller.endGame("defusalModeNeverHappened")}
      }

      this.resetAllBalldesigns = function(model){
        var balls = model.getBalls()
        for(var m=0, numBalls = balls.length; m<numBalls; m++){
          balls[m].setColor(ballColor);
        }
      }
    }

    function updateGame(currentTime){
      if(!curLevel.gameOver()){
      window.requestAnimationFrame(function(){
          curLevel.update(currentTime);
          window.requestAnimationFrame(updateGame)
      })
    }
    }
    jsPsych.finishTrial(data);
  }

  return plugin;
})();
