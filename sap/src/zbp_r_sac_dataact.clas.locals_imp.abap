CLASS lhc_dataaction DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR dataaction RESULT result.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR dataaction~SetOwner.
ENDCLASS.

CLASS lhc_dataaction IMPLEMENTATION.

  " the owner changes and deletes; whoever the action was shared with for editing changes it; the others can only open and run it
  METHOD get_instance_authorizations.
    DATA may_edit TYPE abap_boolean.
    DATA may_delete TYPE abap_boolean.
    LOOP AT keys INTO DATA(key).
      may_edit = zcl_sac_access=>can_edit( kind = 'DATAACTION' id = key-ActionId ).
      may_delete = zcl_sac_access=>can_delete( kind = 'DATAACTION' id = key-ActionId ).
      APPEND VALUE #( %tky    = key-%tky
                %update = COND #( WHEN may_edit = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized )
                %delete = COND #( WHEN may_delete = abap_true THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ) ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " a new data action belongs to the user who creates it
  METHOD setowner.
    READ ENTITIES OF zr_sac_dataact IN LOCAL MODE
      ENTITY dataaction
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(actions).
    DELETE actions WHERE OwnerId IS NOT INITIAL.
    CHECK actions IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_dataact IN LOCAL MODE
      ENTITY dataaction
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR a IN actions ( %tky = a-%tky OwnerId = zcl_sac_access=>user( ) ) ).
  ENDMETHOD.

ENDCLASS.
